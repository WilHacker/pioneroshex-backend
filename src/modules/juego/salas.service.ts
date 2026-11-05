import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { crearMesa } from '../../core/estado/mesa.js';
import type { Estado } from '../../core/estado/tipos.js';
import { JUGADORES_MAX, JUGADORES_MIN } from '../../core/partida/game-config.js';
import type {
  JugadorDeSala,
  RepositorioSalas,
  SalaGuardada,
} from '../../infra/salas/repositorio-salas.js';
import type { EmpezarEntrada } from '../../schemas/salas.js';
import type { PartidaActor } from './partida-actor.js';
import { crearIdDeSala, LimiteDePartidasError, type PartidasService } from './partidas.service.js';

export const LIMITE_SALAS_POR_DEFECTO = 1000;
/** Una sala que nadie ha empezado en una hora se descarta. */
export const SALA_EN_ESPERA_MAX_MS = 60 * 60 * 1000;
/** Una partida sin jugadas ni nadie conectado en 6 horas se descarta. */
export const PARTIDA_INACTIVA_MAX_MS = 6 * 60 * 60 * 1000;
const BARRIDO_CADA_MS = 5 * 60 * 1000;
const BYTES_TOKEN = 24;
const LARGO_MAX_TOKEN = 200;

export interface OpcionesSalas {
  /** Reloj en milisegundos; se inyecta solo para probar. */
  readonly ahora?: () => number;
  readonly limiteSalas?: number | undefined;
}

export interface SalaPublica {
  readonly id: string;
  readonly empezada: boolean;
  readonly anfitrion: string;
  readonly jugadores: readonly { readonly id: string; readonly nombre: string }[];
}

export interface Credencial {
  readonly salaId: string;
  readonly jugadorId: string;
  /** Solo se entrega esta vez: el servidor guarda únicamente su hash. */
  readonly token: string;
}

interface SalaViva {
  readonly id: string;
  readonly anfitrion: string;
  readonly jugadores: readonly JugadorDeSala[];
  readonly partidaId: string | null;
}

const hashDe = (token: string): string => createHash('sha256').update(token).digest('hex');

const mensajeDe = (error: unknown): string =>
  error instanceof Error ? error.message || error.name : String(error);

/**
 * Salas de espera y las partidas que salen de ellas. No hay cuentas: quien crea o entra a una sala
 * recibe un token secreto, y ese token es lo que lo identifica como jugador en el socket.
 * La memoria manda; el repositorio es una copia para sobrevivir a un reinicio.
 */
export class SalasService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SalasService.name);
  private readonly salas = new Map<string, SalaViva>();
  private readonly ahora: () => number;
  private readonly limiteSalas: number;
  private temporizador: NodeJS.Timeout | undefined;
  private escritura: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly partidas: PartidasService,
    private readonly repositorio: RepositorioSalas,
    opciones: OpcionesSalas = {},
  ) {
    this.ahora = opciones.ahora ?? Date.now;
    this.limiteSalas = opciones.limiteSalas ?? LIMITE_SALAS_POR_DEFECTO;
  }

  async onModuleInit(): Promise<void> {
    await this.restaurar();
    this.temporizador = setInterval(() => void this.barrer(), BARRIDO_CADA_MS);
    this.temporizador.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.temporizador);
  }

  async crear(nombre: string): Promise<Credencial> {
    if (this.salas.size >= this.limiteSalas) {
      throw new ServiceUnavailableException('Hay demasiadas salas abiertas, prueba más tarde');
    }
    const id = crearIdDeSala((candidato) => this.salas.has(candidato));
    const { jugador, token } = this.nuevoJugador(1, nombre);
    const sala: SalaViva = { id, anfitrion: jugador.id, jugadores: [jugador], partidaId: null };
    this.salas.set(id, sala);
    await this.guardar(sala, null);
    return { salaId: id, jugadorId: jugador.id, token };
  }

  async unirse(salaId: string, nombre: string): Promise<Credencial> {
    const sala = this.requerir(salaId);
    if (sala.partidaId !== null) throw new ConflictException('La partida ya empezó');
    if (sala.jugadores.length >= JUGADORES_MAX) {
      throw new ConflictException(`La sala está llena (máximo ${JUGADORES_MAX} jugadores)`);
    }
    const { jugador, token } = this.nuevoJugador(sala.jugadores.length + 1, nombre);
    const nueva: SalaViva = { ...sala, jugadores: [...sala.jugadores, jugador] };
    this.salas.set(salaId, nueva);
    await this.guardar(nueva, null);
    return { salaId, jugadorId: jugador.id, token };
  }

  estado(salaId: string): SalaPublica {
    const sala = this.requerir(salaId);
    return {
      id: sala.id,
      empezada: sala.partidaId !== null,
      anfitrion: sala.anfitrion,
      jugadores: sala.jugadores.map((j) => ({ id: j.id, nombre: j.nombre })),
    };
  }

  /** Quién es el dueño del token en esa sala, o `undefined` si no es de nadie. */
  autenticar(salaId: string, token: string): string | undefined {
    const sala = this.salas.get(salaId);
    if (!sala || token === '' || token.length > LARGO_MAX_TOKEN) return undefined;
    const buscado = Buffer.from(hashDe(token), 'hex');
    let encontrado: string | undefined;
    // Se recorren todos a propósito: el tiempo no revela cuál coincidió.
    for (const jugador of sala.jugadores) {
      if (timingSafeEqual(buscado, Buffer.from(jugador.tokenHash, 'hex'))) encontrado = jugador.id;
    }
    return encontrado;
  }

  partida(salaId: string): PartidaActor | undefined {
    const partidaId = this.salas.get(salaId)?.partidaId;
    return partidaId ? this.partidas.obtener(partidaId) : undefined;
  }

  async empezar(salaId: string, token: string, opciones: EmpezarEntrada): Promise<void> {
    const sala = this.requerir(salaId);
    const jugadorId = this.autenticar(salaId, token);
    if (jugadorId === undefined) throw new UnauthorizedException('Token inválido');
    if (jugadorId !== sala.anfitrion) {
      throw new ForbiddenException('Solo el anfitrión puede empezar la partida');
    }
    if (sala.partidaId !== null) throw new ConflictException('La partida ya empezó');
    if (sala.jugadores.length < JUGADORES_MIN) {
      throw new ConflictException(`Hacen falta al menos ${JUGADORES_MIN} jugadores`);
    }
    const { id: partidaId, actor } = this.crearPartida(sala, opciones);
    const nueva: SalaViva = { ...sala, partidaId };
    this.salas.set(salaId, nueva);
    await this.guardar(nueva, actor.estado);
  }

  /** Quita salas en espera abandonadas y partidas muertas (con su sala). */
  async barrer(): Promise<void> {
    const ahora = this.ahora();
    this.partidas.barrer(PARTIDA_INACTIVA_MAX_MS, ahora);
    const quitadas: string[] = [];
    for (const sala of this.salas.values()) {
      const partidaMuerta = sala.partidaId !== null && !this.partidas.obtener(sala.partidaId);
      const enEsperaVieja =
        sala.partidaId === null && ahora - this.ultimaVez(sala.id) > SALA_EN_ESPERA_MAX_MS;
      if (partidaMuerta || enEsperaVieja) quitadas.push(sala.id);
    }
    for (const id of quitadas) {
      this.salas.delete(id);
      this.ultimas.delete(id);
    }
    await Promise.all(
      quitadas.map((id) =>
        this.intentar(() => this.enCola(() => this.repositorio.eliminar(id)), 'borrar la sala'),
      ),
    );
  }

  // Cuándo se tocó por última vez cada sala en espera (las partidas llevan su propia hora).
  private readonly ultimas = new Map<string, number>();

  private ultimaVez(salaId: string): number {
    return this.ultimas.get(salaId) ?? 0;
  }

  private requerir(salaId: string): SalaViva {
    const sala = this.salas.get(salaId);
    if (!sala) throw new NotFoundException('La sala no existe');
    return sala;
  }

  private nuevoJugador(numero: number, nombre: string): { jugador: JugadorDeSala; token: string } {
    const token = randomBytes(BYTES_TOKEN).toString('base64url');
    return { jugador: { id: `j${numero}`, nombre, tokenHash: hashDe(token) }, token };
  }

  private crearPartida(
    sala: SalaViva,
    opciones: EmpezarEntrada,
  ): { id: string; actor: PartidaActor } {
    try {
      return this.partidas.crear(
        sala.jugadores.map((j) => j.id),
        opciones,
        () => ({ ahora: this.ahora, alCambiar: (estado) => this.guardarPorId(sala.id, estado) }),
      );
    } catch (error: unknown) {
      if (error instanceof LimiteDePartidasError) {
        throw new ServiceUnavailableException(error.message);
      }
      throw new BadRequestException(mensajeDe(error));
    }
  }

  private guardarPorId(salaId: string, estado: Estado): Promise<void> {
    return this.enCola(async () => {
      // Se mira al ejecutar, no al encolar: si la sala se barrió mientras tanto, no se resucita.
      const sala = this.salas.get(salaId);
      if (sala) await this.repositorio.guardar(this.aFila(sala, estado));
    });
  }

  private async guardar(sala: SalaViva, estado: Estado | null): Promise<void> {
    this.ultimas.set(sala.id, this.ahora());
    await this.intentar(
      () => this.enCola(() => this.repositorio.guardar(this.aFila(sala, estado))),
      'guardar la sala',
    );
  }

  /** Las escrituras van una tras otra: una instantánea vieja nunca pisa a una más nueva. */
  private enCola(accion: () => Promise<void>): Promise<void> {
    const tarea = this.escritura.then(accion);
    this.escritura = tarea.catch(() => undefined);
    return tarea;
  }

  private aFila(sala: SalaViva, estado: Estado | null): SalaGuardada {
    return { ...sala, estado, actualizadaEn: this.ahora() };
  }

  /** Un fallo del almacenamiento se registra: la partida en memoria sigue siendo la verdad. */
  private async intentar(accion: () => Promise<void>, que: string): Promise<void> {
    try {
      await accion();
    } catch (error: unknown) {
      this.logger.error(
        `No se pudo ${que}: ${mensajeDe(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async restaurar(): Promise<void> {
    let guardadas: SalaGuardada[] = [];
    try {
      guardadas = await this.repositorio.cargarTodas();
    } catch (error: unknown) {
      this.logger.error(
        `No se pudieron cargar las salas guardadas: ${mensajeDe(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return;
    }
    for (const guardada of guardadas) {
      try {
        this.restaurarUna(guardada);
      } catch (error: unknown) {
        this.logger.error(
          `Se omite la sala guardada "${guardada.id}": ${mensajeDe(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  private restaurarUna(g: SalaGuardada): void {
    const { estado, partidaId } = g;
    if (partidaId !== null && estado !== null) {
      this.partidas.restaurar(partidaId, crearMesa(estado.config), estado, {
        ahora: this.ahora,
        alCambiar: (nuevo) => this.guardarPorId(g.id, nuevo),
      });
    }
    this.salas.set(g.id, {
      id: g.id,
      anfitrion: g.anfitrion,
      jugadores: g.jugadores,
      partidaId: estado !== null ? partidaId : null,
    });
    this.ultimas.set(g.id, this.ahora());
  }
}
