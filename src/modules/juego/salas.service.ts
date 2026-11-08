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
import { aMapaConfig, infoDelMapa, mapaDelCatalogo } from '../../core/catalogo/catalogo.js';
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
  /** Jugadores que admite la sala: el tope del juego o el del mapa elegido, el que sea menor. */
  readonly maximo: number;
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

/** Jugadores que admite la sala: el menor entre el tope que eligió el anfitrión, el del mapa y el del juego. */
function maximoDeSala(sala: SalaViva): number {
  const id = sala.opciones.mapa;
  const mapa = typeof id === 'string' ? mapaDelCatalogo(id) : undefined;
  const delMapa = mapa ? infoDelMapa(mapa).maximoTecnico : JUGADORES_MAX;
  const elegido = sala.opciones.maxJugadores;
  return typeof elegido === 'number' ? Math.min(elegido, delMapa) : delMapa;
}

/** Los segundos que eligió el anfitrión (o nada) como milisegundos para el actor. */
const limiteDeTurnoMs = (segundos: unknown): number | undefined =>
  typeof segundos === 'number' && segundos > 0 ? segundos * 1000 : undefined;

/** El número que sigue al id más alto (`j3` → 4): ids que no se repiten aunque alguien haya salido. */
function siguienteNumero(jugadores: readonly JugadorDeSala[]): number {
  const numeros = jugadores.map((j) => Number(j.id.slice(1))).filter(Number.isInteger);
  return Math.max(0, ...numeros) + 1;
}

const hashDe = (token: string): string => createHash('sha256').update(token).digest('hex');

const mensajeDe = (error: unknown): string =>
  error instanceof Error ? error.message || error.name : String(error);

/**
 * Salas de espera y las partidas que salen de ellas. No hay cuentas: quien crea o entra a una sala
 * recibe un token secreto, y ese token es lo que lo identifica como jugador en el socket.
 * La memoria manda; el repositorio es una copia para sobrevivir a un reinicio.
 */
/** Dos nombres son el mismo si solo difieren en mayúsculas, espacios sobrantes o forma Unicode. */
function claveDeNombre(nombre: string): string {
  return nombre.normalize('NFC').trim().toLocaleLowerCase('es');
}

export class SalasService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SalasService.name);
  private readonly salas = new Map<string, SalaViva>();
  private readonly ahora: () => number;
  private readonly limiteSalas: number;
  private readonly historial: RepositorioHistorial | undefined;
  private temporizador: NodeJS.Timeout | undefined;
  private escritura: Promise<unknown> = Promise.resolve();
  private readonly escuchas = new Set<(salaId: string) => void>();

  constructor(
    private readonly partidas: PartidasService,
    private readonly repositorio: RepositorioSalas,
    opciones: OpcionesSalas = {},
  ) {
    this.ahora = opciones.ahora ?? Date.now;
    this.limiteSalas = opciones.limiteSalas ?? LIMITE_SALAS_POR_DEFECTO;
    this.historial = opciones.historial;
  }

  /**
   * Avisa cada vez que una sala cambia (o desaparece), cuando el estado en memoria ya es el nuevo.
   * Es lo que usa el socket de la sala de espera para empujar el estado en lugar de sondear.
   * Devuelve la función que da de baja la escucha.
   */
  alCambiar(escucha: (salaId: string) => void): () => void {
    this.escuchas.add(escucha);
    return () => void this.escuchas.delete(escucha);
  }

  private avisar(salaId: string): void {
    for (const escucha of this.escuchas) {
      try {
        escucha(salaId);
      } catch (error: unknown) {
        this.logger.error(`Falló una escucha de cambios de sala: ${mensajeDe(error)}`);
      }
    }
  }

  async onModuleInit(): Promise<void> {
    await this.restaurar();
    this.temporizador = setInterval(() => void this.barrer(), BARRIDO_CADA_MS);
    this.temporizador.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.temporizador);
  }

  async crear(
    nombre: string,
    publica = false,
    usuarioId?: string,
    reglas: Omit<CambiarSalaEntrada, 'publica'> = {},
  ): Promise<Credencial> {
    if (this.salas.size >= this.limiteSalas) {
      throw new ServiceUnavailableException('Hay demasiadas salas abiertas, prueba más tarde');
    }
    // Antes de crear nada: un mapa que no existe no deja una sala a medias.
    if (typeof reglas.mapa === 'string') this.requerirQueCaben({ jugadores: [] }, reglas.mapa);
    const id = crearIdDeSala((candidato) => this.salas.has(candidato));
    const { jugador, token } = this.nuevoJugador(1, nombre, usuarioId);
    const sala: SalaViva = {
      id,
      anfitrion: jugador.id,
      jugadores: [jugador],
      partidaId: null,
      publica,
      opciones: { ...reglas },
    };
    this.salas.set(id, sala);
    await this.guardar(sala, null);
    return { salaId: id, jugadorId: jugador.id, token };
  }

  async unirse(salaId: string, nombre: string, usuarioId?: string): Promise<Credencial> {
    const sala = this.requerir(salaId);
    if (sala.partidaId !== null) throw new ConflictException('La partida ya empezó');
    const suyo =
      usuarioId === undefined ? undefined : sala.jugadores.find((j) => j.usuarioId === usuarioId);
    if (suyo) return this.recuperarAsiento(sala, suyo);
    const maximo = maximoDeSala(sala);
    if (sala.jugadores.length >= maximo) {
      throw new ConflictException(`La sala está llena (máximo ${maximo} jugadores)`);
    }
    // Un nombre por sala: sin cuenta no hay otra forma de saber que es la misma persona, y quien
    // vuelve a entrar con su enlace conserva su credencial en el navegador.
    const clave = claveDeNombre(nombre);
    if (sala.jugadores.some((j) => claveDeNombre(j.nombre) === clave)) {
      throw new ConflictException('Ya hay alguien con ese nombre en la sala: elige otro');
    }
    const { jugador, token } = this.nuevoJugador(
      siguienteNumero(sala.jugadores),
      nombre,
      usuarioId,
    );
    const nueva: SalaViva = { ...sala, jugadores: [...sala.jugadores, jugador] };
    this.salas.set(salaId, nueva);
    await this.guardar(nueva, null);
    return { salaId, jugadorId: jugador.id, token };
  }

  /**
   * La misma cuenta que vuelve a una sala en la que ya estaba (otra pestaña, otro dispositivo) es la
   * misma persona: conserva su asiento y recibe un token nuevo. El anterior deja de valer.
   */
  private async recuperarAsiento(sala: SalaViva, jugador: JugadorDeSala): Promise<Credencial> {
    const token = randomBytes(BYTES_TOKEN).toString('base64url');
    const nueva: SalaViva = {
      ...sala,
      jugadores: sala.jugadores.map((j) =>
        j.id === jugador.id ? { ...j, tokenHash: hashDe(token) } : j,
      ),
    };
    this.salas.set(sala.id, nueva);
    await this.guardar(nueva, null);
    return { salaId: sala.id, jugadorId: jugador.id, token };
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
      maximo: maximoDeSala(sala),
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
        maximo: maximoDeSala(sala),
      });
    }
    return lista.slice(0, SALAS_ABIERTAS_MAX);
  }

  /** El anfitrión cambia la visibilidad y las reglas mientras la sala espera. */
  async cambiar(salaId: string, token: string, cambios: CambiarSalaEntrada): Promise<void> {
    const sala = this.requerirAnfitrion(salaId, token);
    if (sala.partidaId !== null) throw new ConflictException('La partida ya empezó');
    const { publica, ...reglas } = cambios;
    if (typeof reglas.mapa === 'string') this.requerirQueCaben(sala, reglas.mapa);
    if (reglas.maxJugadores !== undefined && reglas.maxJugadores < sala.jugadores.length) {
      throw new ConflictException(
        `La sala ya tiene ${sala.jugadores.length} jugadores: el máximo no puede ser menor`,
      );
    }
    const nueva: SalaViva = {
      ...sala,
      publica: publica ?? sala.publica,
      opciones: { ...sala.opciones, ...reglas },
    };
    this.salas.set(salaId, nueva);
    await this.guardar(nueva, null);
  }

  /** Un jugador se va de la sala de espera. Si era el anfitrión, el cargo pasa al más antiguo. */
  async salir(salaId: string, token: string): Promise<void> {
    const sala = this.requerir(salaId);
    const jugadorId = this.autenticar(salaId, token);
    if (jugadorId === undefined) throw new UnauthorizedException('Token inválido');
    if (sala.partidaId !== null) throw new ConflictException('La partida ya empezó');
    await this.quitar(sala, jugadorId);
  }

  /** El anfitrión saca a otro jugador de la sala de espera. */
  async expulsar(salaId: string, token: string, jugadorId: string): Promise<void> {
    const sala = this.requerirAnfitrion(salaId, token);
    if (sala.partidaId !== null) throw new ConflictException('La partida ya empezó');
    if (jugadorId === sala.anfitrion) {
      throw new ConflictException('El anfitrión no puede expulsarse a sí mismo: usa «salir»');
    }
    this.requerirJugador(sala, jugadorId);
    await this.quitar(sala, jugadorId);
  }

  /** El anfitrión le pasa el cargo a otro jugador de la sala. */
  async cederAnfitrion(salaId: string, token: string, jugadorId: string): Promise<void> {
    const sala = this.requerirAnfitrion(salaId, token);
    if (sala.partidaId !== null) throw new ConflictException('La partida ya empezó');
    if (jugadorId === sala.anfitrion) throw new ConflictException('Ya eres el anfitrión');
    this.requerirJugador(sala, jugadorId);
    const nueva: SalaViva = { ...sala, anfitrion: jugadorId };
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
      this.avisar(id);
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

  private requerirJugador(sala: SalaViva, jugadorId: string): void {
    if (!sala.jugadores.some((j) => j.id === jugadorId)) {
      throw new NotFoundException('Ese jugador no está en la sala');
    }
  }

  /** Saca a `jugadorId` de la sala; sin nadie dentro, la sala se borra. */
  private async quitar(sala: SalaViva, jugadorId: string): Promise<void> {
    const quedan = sala.jugadores.filter((j) => j.id !== jugadorId);
    const [primero] = quedan;
    if (primero === undefined) {
      this.salas.delete(sala.id);
      this.ultimas.delete(sala.id);
      this.avisar(sala.id);
      await this.intentar(
        () => this.enCola(() => this.repositorio.eliminar(sala.id)),
        'borrar la sala',
      );
      return;
    }
    const nueva: SalaViva = {
      ...sala,
      jugadores: quedan,
      anfitrion: sala.anfitrion === jugadorId ? primero.id : sala.anfitrion,
    };
    this.salas.set(sala.id, nueva);
    await this.guardar(nueva, null);
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

  /** Que el mapa elegido exista y admita a los jugadores que la sala ya tiene. */
  private requerirQueCaben(sala: Pick<SalaViva, 'jugadores'>, idMapa: string): void {
    const mapa = mapaDelCatalogo(idMapa);
    if (!mapa) throw new BadRequestException(`Mapa desconocido: «${idMapa.slice(0, 40)}»`);
    const { nombre, maximoTecnico } = infoDelMapa(mapa);
    if (sala.jugadores.length > maximoTecnico) {
      throw new ConflictException(
        `El mapa «${nombre}» admite hasta ${maximoTecnico} jugadores y la sala ya tiene ${sala.jugadores.length}`,
      );
    }
  }

  private crearPartida(
    sala: SalaViva,
    opciones: EmpezarEntrada & { readonly maxJugadores?: number | undefined },
  ): { id: string; actor: PartidaActor } {
    // El tiempo por turno es cosa del servidor (el actor), no una regla del motor. El mapa llega
    // como el id de un mapa del catálogo y a la partida va como una copia de sus casillas.
    const { turnoSegundos, mapa: idMapa, maxJugadores: _tope, ...reglas } = opciones;
    const entradaMapa = typeof idMapa === 'string' ? mapaDelCatalogo(idMapa) : undefined;
    if (typeof idMapa === 'string' && !entradaMapa) {
      throw new BadRequestException(`Mapa desconocido: «${idMapa.slice(0, 40)}»`);
    }
    try {
      return this.partidas.crear(
        sala.jugadores.map((j) => j.id),
        { ...reglas, ...(entradaMapa ? { mapa: aMapaConfig(entradaMapa) } : {}) },
        () => ({
          ahora: this.ahora,
          alCambiar: (estado) => this.guardarPorId(sala.id, estado),
          limiteTurnoMs: limiteDeTurnoMs(turnoSegundos),
        }),
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
    this.avisar(sala.id);
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
        // Tras un reinicio, quien debía actuar recibe su tiempo completo.
        limiteTurnoMs: limiteDeTurnoMs(g.opciones?.turnoSegundos),
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
