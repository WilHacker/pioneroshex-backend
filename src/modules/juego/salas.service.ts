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
import { puntosDe } from '../../core/estado/puntos.js';
import type { Estado } from '../../core/estado/tipos.js';
import { JUGADORES_MAX, JUGADORES_MIN } from '../../core/partida/game-config.js';
import type { RepositorioHistorial } from '../../infra/historial/repositorio-historial.js';
import type {
  JugadorDeSala,
  RepositorioSalas,
  SalaGuardada,
} from '../../infra/salas/repositorio-salas.js';
import type { CambiarSalaEntrada, EmpezarEntrada } from '../../schemas/salas.js';
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
  /** Dónde guardar el resultado de las partidas con jugadores que tienen cuenta. */
  readonly historial?: RepositorioHistorial | undefined;
}

export interface SalaPublica {
  readonly id: string;
  readonly empezada: boolean;
  readonly anfitrion: string;
  readonly jugadores: readonly { readonly id: string; readonly nombre: string }[];
  readonly publica: boolean;
  readonly opciones: Readonly<Record<string, unknown>>;
}

/** Una fila de la lista de salas abiertas: solo lo que hace falta para decidir si entrar. */
export interface SalaAbierta {
  readonly id: string;
  readonly anfitrion: string;
  readonly jugadores: number;
  readonly maximo: number;
}

const SALAS_ABIERTAS_MAX = 50;

export interface ResumenDeSalas {
  readonly salasAbiertas: number;
  readonly partidasEnCurso: number;
  readonly jugadores: number;
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
  readonly publica: boolean;
  readonly opciones: Readonly<Record<string, unknown>>;
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
  private readonly historial: RepositorioHistorial | undefined;
  private temporizador: NodeJS.Timeout | undefined;
  private escritura: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly partidas: PartidasService,
    private readonly repositorio: RepositorioSalas,
    opciones: OpcionesSalas = {},
  ) {
    this.ahora = opciones.ahora ?? Date.now;
    this.limiteSalas = opciones.limiteSalas ?? LIMITE_SALAS_POR_DEFECTO;
    this.historial = opciones.historial;
  }

  async onModuleInit(): Promise<void> {
    await this.restaurar();
    this.temporizador = setInterval(() => void this.barrer(), BARRIDO_CADA_MS);
    this.temporizador.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.temporizador);
  }

  async crear(nombre: string, publica = false, usuarioId?: string): Promise<Credencial> {
    if (this.salas.size >= this.limiteSalas) {
      throw new ServiceUnavailableException('Hay demasiadas salas abiertas, prueba más tarde');
    }
    const id = crearIdDeSala((candidato) => this.salas.has(candidato));
    const { jugador, token } = this.nuevoJugador(1, nombre, usuarioId);
    const sala: SalaViva = {
      id,
      anfitrion: jugador.id,
      jugadores: [jugador],
      partidaId: null,
      publica,
      opciones: {},
    };
    this.salas.set(id, sala);
    await this.guardar(sala, null);
    return { salaId: id, jugadorId: jugador.id, token };
  }

  async unirse(salaId: string, nombre: string, usuarioId?: string): Promise<Credencial> {
    const sala = this.requerir(salaId);
    if (sala.partidaId !== null) throw new ConflictException('La partida ya empezó');
    if (sala.jugadores.length >= JUGADORES_MAX) {
      throw new ConflictException(`La sala está llena (máximo ${JUGADORES_MAX} jugadores)`);
    }
    if (usuarioId !== undefined && sala.jugadores.some((j) => j.usuarioId === usuarioId)) {
      throw new ConflictException('Ya estás en esta sala');
    }
    const { jugador, token } = this.nuevoJugador(sala.jugadores.length + 1, nombre, usuarioId);
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
      publica: sala.publica,
      opciones: sala.opciones,
    };
  }

  /** Las salas públicas que aún esperan jugadores. Sin ids de jugador ni tokens. */
  abiertas(): SalaAbierta[] {
    const lista: SalaAbierta[] = [];
    for (const sala of this.salas.values()) {
      if (!sala.publica || sala.partidaId !== null) continue;
      lista.push({
        id: sala.id,
        anfitrion: sala.jugadores.find((j) => j.id === sala.anfitrion)?.nombre ?? '',
        jugadores: sala.jugadores.length,
        maximo: JUGADORES_MAX,
      });
    }
    return lista.slice(0, SALAS_ABIERTAS_MAX);
  }

  /** El anfitrión cambia la visibilidad y las reglas mientras la sala espera. */
  async cambiar(salaId: string, token: string, cambios: CambiarSalaEntrada): Promise<void> {
    const sala = this.requerirAnfitrion(salaId, token);
    if (sala.partidaId !== null) throw new ConflictException('La partida ya empezó');
    const { publica, ...reglas } = cambios;
    const nueva: SalaViva = {
      ...sala,
      publica: publica ?? sala.publica,
      opciones: { ...sala.opciones, ...reglas },
    };
    this.salas.set(salaId, nueva);
    await this.guardar(nueva, null);
  }

  /** Números sueltos para la portada: nada de ids, nombres ni tokens. */
  resumen(): ResumenDeSalas {
    let salasAbiertas = 0;
    let partidasEnCurso = 0;
    let jugadores = 0;
    for (const sala of this.salas.values()) {
      if (sala.partidaId === null) salasAbiertas += 1;
      else partidasEnCurso += 1;
      jugadores += sala.jugadores.length;
    }
    return { salasAbiertas, partidasEnCurso, jugadores };
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
    const sala = this.requerirAnfitrion(salaId, token);
    if (sala.partidaId !== null) throw new ConflictException('La partida ya empezó');
    if (sala.jugadores.length < JUGADORES_MIN) {
      throw new ConflictException(`Hacen falta al menos ${JUGADORES_MIN} jugadores`);
    }
    const { id: partidaId, actor } = this.crearPartida(sala, { ...sala.opciones, ...opciones });
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

  /** La sala, si el token es válido y es el del anfitrión; si no, 401 o 403. */
  private requerirAnfitrion(salaId: string, token: string): SalaViva {
    const sala = this.requerir(salaId);
    const jugadorId = this.autenticar(salaId, token);
    if (jugadorId === undefined) throw new UnauthorizedException('Token inválido');
    if (jugadorId !== sala.anfitrion) {
      throw new ForbiddenException('Solo el anfitrión puede cambiar o empezar la partida');
    }
    return sala;
  }

  private nuevoJugador(
    numero: number,
    nombre: string,
    usuarioId?: string,
  ): { jugador: JugadorDeSala; token: string } {
    const token = randomBytes(BYTES_TOKEN).toString('base64url');
    const jugador: JugadorDeSala = {
      id: `j${numero}`,
      nombre,
      tokenHash: hashDe(token),
      ...(usuarioId === undefined ? {} : { usuarioId }),
    };
    return { jugador, token };
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

  private async guardarPorId(salaId: string, estado: Estado): Promise<void> {
    await this.enCola(async () => {
      // Se mira al ejecutar, no al encolar: si la sala se barrió mientras tanto, no se resucita.
      const sala = this.salas.get(salaId);
      if (sala) await this.repositorio.guardar(this.aFila(sala, estado));
    });
    await this.registrarSiTermino(salaId, estado);
  }

  // Salas cuyo resultado ya está en el historial (evita repetir el intento en cada jugada).
  private readonly registradas = new Set<string>();

  /**
   * Cuando la partida tiene ganador, guarda su resultado una sola vez, y solo si jugó alguien con
   * cuenta (de los invitados no se guarda historial). Un fallo se registra y no afecta a la partida.
   */
  async registrarSiTermino(salaId: string, estado: Estado): Promise<void> {
    const { historial } = this;
    const sala = this.salas.get(salaId);
    if (!historial || !sala || estado.ganador === null || this.registradas.has(salaId)) return;
    if (!sala.jugadores.some((j) => j.usuarioId !== undefined)) {
      this.registradas.add(salaId);
      return;
    }
    const ganador = estado.ganador;
    await this.intentar(async () => {
      await historial.registrar({
        id: salaId,
        terminadaEn: this.ahora(),
        puntosVictoria: estado.config.puntosVictoria,
        ganador: sala.jugadores.find((j) => j.id === ganador)?.nombre ?? ganador,
        participantes: sala.jugadores.map((j) => ({
          usuarioId: j.usuarioId ?? null,
          nombre: j.nombre,
          puntos: puntosDe(estado, j.id, { incluirOcultos: true }),
          gano: j.id === ganador,
        })),
      });
      this.registradas.add(salaId);
    }, 'registrar el resultado de la partida');
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
      publica: g.publica ?? false,
      opciones: g.opciones ?? {},
    });
    this.ultimas.set(g.id, this.ahora());
    // Si el servidor se cayó justo al terminar la partida, se completa el registro al volver.
    if (estado !== null) void this.registrarSiTermino(g.id, estado);
  }
}
