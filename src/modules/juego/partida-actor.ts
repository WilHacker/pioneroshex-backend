import { Logger } from '@nestjs/common';
import {
  ayuda,
  enumerarAcciones,
  SITIOS_VACIOS,
  type AccionDisponible,
  type Sitios,
} from '../../core/estado/acciones.js';
import type { Mesa } from '../../core/estado/mesa.js';
import { mesaPublica, type MesaPublica } from '../../core/estado/mesa-publica.js';
import {
  paso,
  type Notificacion,
  type Observador,
  type OpcionesPaso,
} from '../../core/estado/paso.js';
import type { Accion, Estado, Evento, Rechazo } from '../../core/estado/tipos.js';
import { vistaPara, type Vista } from '../../core/estado/vista.js';
import { crearRng } from '../../core/reglas/azar.js';
import { elegirAccion } from '../../core/simulacion/bot.js';

/** Recibe lo que ve un observador tras cada jugada aceptada. */
export type Escucha = (notificacion: Notificacion) => void;

export interface OpcionesActor extends OpcionesPaso {
  /** Se llama con el estado nuevo tras cada jugada aceptada (p. ej. para guardarlo). */
  readonly alCambiar?: (estado: Estado) => void | Promise<void>;
  /** Reloj en milisegundos; se inyecta solo para probar. */
  readonly ahora?: () => number;
  /**
   * Tiempo que tiene cada jugador para actuar. Al vencer, el servidor juega por él (tira los dados,
   * descarta, mueve el ladrón o termina el turno). Sin valor o 0, no hay límite.
   */
  readonly limiteTurnoMs?: number | undefined;
  /** Cuánto se espera a un jugador desconectado antes de jugar por él. */
  readonly graciaAusenteMs?: number | undefined;
  /** Tiempo entre jugadas del piloto una vez pasada la gracia. */
  readonly ritmoPilotoMs?: number | undefined;
}

/** Una caída corta o recargar la página no debe costarle el turno a nadie. */
export const GRACIA_AUSENTE_MS = 60_000;
/** Pasada la gracia, el piloto juega a este ritmo para no hacer esperar a los demás. */
export const RITMO_PILOTO_MS = 2_000;

/** Quién está en la partida y a quién juega el piloto automático. Ids en el orden de turno. */
export interface Presencia {
  readonly conectados: readonly string[];
  readonly piloto: readonly string[];
  /** Quienes dejaron la partida a propósito (también van en piloto mientras haya alguien). */
  readonly abandonaron: readonly string[];
}

export type OyenteDePresencia = (presencia: Presencia) => void;

/** En la preparación no hay reloj: no existe una jugada segura que hacer por quien no coloca. */
const FASES_CON_RELOJ: ReadonlySet<Estado['fase']> = new Set([
  'PRE_TIRADA',
  'DESCARTE',
  'MOVER_LADRON',
  'FASE_PRINCIPAL',
  'CONSTRUCCION_ESPECIAL',
]);

export type ResultadoEnvio =
  | {
      readonly ok: true;
      readonly estado: Estado;
      /** Con secretos: para guardar o auditar en el servidor, nunca para un cliente. */
      readonly eventosCompletos: readonly Evento[];
    }
  | Rechazo;

/**
 * Una partida viva en memoria. Procesa **una acción a la vez** (cola), así que dos jugadores que
 * actúan "a la vez" nunca se pisan, y reparte a cada suscriptor la notificación filtrada para él.
 *
 * Quien la use debe fijar `accion.jugador` desde la sesión autenticada, nunca desde lo que mande el
 * cliente: el actor confía en él. Los temporizadores de inactividad, la persistencia y la red viven
 * fuera: este objeto solo ordena las jugadas y avisa.
 */
export class PartidaActor {
  private readonly logger = new Logger(PartidaActor.name);
  private readonly escuchas = new Map<Observador, Set<{ readonly escucha: Escucha }>>();
  private actual: Estado;
  private ultimaActividadMs: number;
  private cola: Promise<unknown> = Promise.resolve();
  private temporizador: NodeJS.Timeout | undefined;
  private venceEn: number | null = null;
  private detenido = false;
  /** Desde cuándo no tiene ninguna conexión cada jugador desconectado. */
  private readonly ausenteDesde = new Map<string, number>();
  private readonly oyentesDePresencia = new Set<OyenteDePresencia>();
  private temporizadorPiloto: NodeJS.Timeout | undefined;
  /** El tablero no cambia con las jugadas: se calcula una vez. */
  readonly mesaPublica: MesaPublica;

  constructor(
    private readonly mesa: Mesa,
    estadoInicial: Estado,
    private readonly opciones: OpcionesActor = {},
  ) {
    this.actual = estadoInicial;
    this.ultimaActividadMs = this.ahora();
    // Al empezar nadie está conectado: quien nunca llegue también acabará en piloto.
    for (const j of estadoInicial.jugadores) this.ausenteDesde.set(j.id, this.ultimaActividadMs);
    this.mesaPublica = mesaPublica(mesa);
    this.programarReloj();
  }

  get estado(): Estado {
    return this.actual;
  }

  /** Última jugada aceptada, conexión o desconexión, en ms. Sirve para expirar partidas muertas. */
  get ultimaActividad(): number {
    return this.ultimaActividadMs;
  }

  /** Cuánto le queda al jugador que debe actuar, o `null` si no hay reloj ahora. */
  get restanteMs(): number | null {
    return this.venceEn === null ? null : Math.max(0, this.venceEn - this.ahora());
  }

  /** Apaga el reloj para siempre (la partida se descartó o el servidor se apaga). */
  detener(): void {
    this.detenido = true;
    this.programarReloj();
  }

  /** Cuántas escuchas hay activas (sockets conectados). */
  get suscriptores(): number {
    let total = 0;
    for (const conjunto of this.escuchas.values()) total += conjunto.size;
    return total;
  }

  private ahora(): number {
    return (this.opciones.ahora ?? Date.now)();
  }

  /** Encola la acción; la promesa se resuelve cuando le toca y se ha procesado. */
  enviar(accion: Accion, forzada = false): Promise<ResultadoEnvio> {
    const tarea = this.cola.then(() => this.procesar(accion, forzada));
    // La cola sigue aunque esta tarea falle; el error le llega igualmente a quien la envió.
    this.cola = tarea.catch(() => undefined);
    return tarea;
  }

  /** Lo que ve `observador` ahora mismo (para quien entra o se reconecta). */
  vista(observador: Observador): Vista {
    return vistaPara(this.actual, observador);
  }

  /** Qué puede hacer `jugador` ahora y dónde (para pintar botones y resaltar el tablero). */
  ayuda(jugador: Accion['jugador']): {
    readonly acciones: readonly AccionDisponible[];
    readonly sitios: Sitios;
  } {
    if (!this.actual.jugadores.some((j) => j.id === jugador)) {
      throw new Error(`El jugador "${jugador}" no participa en la partida`);
    }
    return this.actual.fase === 'FIN'
      ? { acciones: [], sitios: SITIOS_VACIOS }
      : ayuda(this.mesa, this.actual, jugador);
  }

  /** Solo las acciones de `ayuda`. Vacío si la partida terminó. */
  acciones(jugador: Accion['jugador']): readonly AccionDisponible[] {
    return this.ayuda(jugador).acciones;
  }

  /** Empieza a recibir notificaciones como `observador`. Devuelve la función para darse de baja. */
  suscribir(observador: Observador, escucha: Escucha): () => void {
    if (observador !== null && !this.actual.jugadores.some((j) => j.id === observador)) {
      throw new Error(`El jugador "${observador}" no participa en la partida`);
    }
    const entrada = { escucha };
    const conjunto = this.escuchas.get(observador) ?? new Set();
    const eraNuevo = conjunto.size === 0;
    conjunto.add(entrada);
    this.escuchas.set(observador, conjunto);
    this.ultimaActividadMs = this.ahora();
    if (eraNuevo && observador !== null) {
      this.ausenteDesde.delete(observador);
      this.alCambiarLaPresencia();
    }
    return () => {
      this.ultimaActividadMs = this.ahora();
      const actuales = this.escuchas.get(observador);
      if (!actuales) return;
      actuales.delete(entrada);
      if (actuales.size > 0) return;
      this.escuchas.delete(observador);
      if (observador !== null) {
        this.ausenteDesde.set(observador, this.ahora());
        this.alCambiarLaPresencia();
      }
    };
  }

  /** Quién está conectado y a quién juega el piloto automático ahora mismo. */
  presencia(): Presencia {
    const ids = this.actual.jugadores.map((j) => j.id);
    const conectados = ids.filter((id) => this.estaConectado(id));
    const piloto =
      conectados.length === 0 || this.actual.fase === 'FIN'
        ? []
        : ids.filter((id) => !this.estaConectado(id) && this.graciaVencida(id));
    return { conectados, piloto, abandonaron: [...this.actual.abandonados] };
  }

  /** Avisa cada vez que alguien se conecta o desconecta, o el piloto empieza a jugar por alguien. */
  alCambiarPresencia(oyente: OyenteDePresencia): () => void {
    this.oyentesDePresencia.add(oyente);
    return () => void this.oyentesDePresencia.delete(oyente);
  }

  private haAbandonado(id: string): boolean {
    return this.actual.abandonados.includes(id);
  }

  /** Quien abandonó no cuenta como conectado aunque conserve la pestaña abierta. */
  private estaConectado(id: string): boolean {
    return !this.haAbandonado(id) && (this.escuchas.get(id)?.size ?? 0) > 0;
  }

  private graciaVencida(id: string): boolean {
    if (this.haAbandonado(id)) return true;
    const desde = this.ausenteDesde.get(id);
    return desde !== undefined && this.ahora() - desde >= this.graciaMs;
  }

  private get graciaMs(): number {
    return this.opciones.graciaAusenteMs ?? GRACIA_AUSENTE_MS;
  }

  private alCambiarLaPresencia(): void {
    this.programarPiloto();
    const presencia = this.presencia();
    for (const oyente of this.oyentesDePresencia) {
      try {
        oyente(presencia);
      } catch (error: unknown) {
        const mensaje = error instanceof Error ? error.message || error.name : String(error);
        this.logger.error(`Falló un oyente de presencia: ${mensaje}`);
      }
    }
  }

  /** A quién le toca actuar ahora (varios en el descarte; nadie al terminar). */
  private quienDebeActuar(): string[] {
    const estado = this.actual;
    if (estado.fase === 'FIN') return [];
    if (estado.fase === 'DESCARTE') return Object.keys(estado.descartesPendientes);
    const indice =
      estado.fase === 'CONSTRUCCION_ESPECIAL' ? estado.turnoEspecialDe : estado.turnoDe;
    const jugador = indice === null ? undefined : estado.jugadores[indice]?.id;
    return jugador === undefined ? [] : [jugador];
  }

  /**
   * Si a quien le toca no está conectado y hay alguien esperando, programa el piloto: cuando se
   * le acabe la gracia, y después a ritmo corto. Sin nadie conectado la partida se congela.
   */
  private programarPiloto(): void {
    clearTimeout(this.temporizadorPiloto);
    this.temporizadorPiloto = undefined;
    if (this.detenido || this.actual.fase === 'FIN') return;
    if (!this.actual.jugadores.some((j) => this.estaConectado(j.id))) return;
    const ausentes = this.quienDebeActuar().filter((id) => !this.estaConectado(id));
    if (ausentes.length === 0) return;
    const ritmo = this.opciones.ritmoPilotoMs ?? RITMO_PILOTO_MS;
    const ahora = this.ahora();
    const espera = Math.min(
      ...ausentes.map((id) =>
        this.haAbandonado(id) ? 0 : (this.ausenteDesde.get(id) ?? ahora) + this.graciaMs - ahora,
      ),
    );
    const version = this.actual.version;
    this.temporizadorPiloto = setTimeout(
      () => void this.juegaElPiloto(version),
      Math.max(espera, ritmo),
    );
    this.temporizadorPiloto.unref();
  }

  /** Pasó la gracia: se juega por los ausentes a quienes les toca, con jugadas que el motor acepta. */
  private async juegaElPiloto(version: number): Promise<void> {
    if (this.detenido || this.actual.version !== version) return;
    const ids = this.quienDebeActuar().filter(
      (id) => !this.estaConectado(id) && this.graciaVencida(id),
    );
    try {
      for (const accion of this.accionesDelPiloto(ids)) {
        // En serie a propósito: cada jugada se apoya en el estado que dejó la anterior.
        // oxlint-disable-next-line no-await-in-loop
        const resultado = await this.enviar(accion, true);
        if (!resultado.ok)
          this.logger.warn(`El motor rechazó la jugada del piloto (${resultado.motivo})`);
      }
    } catch (error: unknown) {
      const mensaje = error instanceof Error ? error.message || error.name : String(error);
      this.logger.error(`Falló la jugada del piloto: ${mensaje}`);
    }
    // Se avisa de que el piloto está jugando y se reprograma (también si se rechazó la jugada).
    this.alCambiarLaPresencia();
  }

  private accionesDelPiloto(ids: readonly string[]): Accion[] {
    const estado = this.actual;
    if (estado.fase === 'DESCARTE') {
      return ids.map((jugador) => ({ tipo: 'DESCARTE_AUTOMATICO', jugador }));
    }
    const [jugador] = ids;
    if (jugador === undefined) return [];
    if (estado.fase === 'PREPARACION_POBLADO' || estado.fase === 'PREPARACION_CAMINO') {
      // En la preparación no hay jugada «de inactividad»: se coloca una pieza legal cualquiera.
      const legales = enumerarAcciones(this.mesa, estado, jugador);
      if (legales.length === 0) return [];
      const rng = crearRng(`${estado.config.semillaAzar}:piloto:${estado.version}`);
      return [elegirAccion(legales, rng)];
    }
    return [{ tipo: 'SALTAR_TURNO_POR_INACTIVIDAD', jugador }];
  }

  /**
   * `forzada`: la juega el servidor (reloj o piloto), no una persona. No cuenta como actividad: si
   * no, una partida abandonada se jugaría sola y no caducaría nunca.
   */
  private procesar(accion: Accion, forzada: boolean): ResultadoEnvio {
    const resultado = paso(
      this.mesa,
      this.actual,
      accion,
      [...this.escuchas.keys()],
      this.opciones,
    );
    if (!resultado.ok) return resultado;
    this.actual = resultado.estado;
    if (!forzada) this.ultimaActividadMs = this.ahora();
    // Antes de avisar: así cada notificación ya lleva el tiempo que le queda al siguiente.
    this.programarReloj();
    if (accion.tipo === 'ABANDONAR') this.alCambiarLaPresencia();
    this.persistir(resultado.estado);
    for (const notificacion of resultado.notificaciones) {
      // Copia a propósito: un suscriptor puede darse de baja mientras se avisa.
      const destinatarios = [...(this.escuchas.get(notificacion.observador) ?? [])];
      for (const { escucha } of destinatarios) this.avisar(escucha, notificacion);
    }
    return { ok: true, estado: resultado.estado, eventosCompletos: resultado.eventosCompletos };
  }

  /** Reinicia el reloj con el tiempo completo para quien debe actuar en el estado actual. */
  private programarReloj(): void {
    clearTimeout(this.temporizador);
    this.temporizador = undefined;
    this.venceEn = null;
    this.programarPiloto();
    const limite = this.opciones.limiteTurnoMs;
    if (this.detenido || !limite || limite <= 0 || !FASES_CON_RELOJ.has(this.actual.fase)) return;
    this.venceEn = this.ahora() + limite;
    const version = this.actual.version;
    this.temporizador = setTimeout(() => void this.vencio(version), limite);
    this.temporizador.unref();
  }

  /** Se acabó el tiempo: se juega por quien no actuó, con la acción que prevé el motor. */
  private async vencio(version: number): Promise<void> {
    // Si mientras tanto hubo una jugada, este aviso ya es viejo.
    if (this.actual.version !== version) return;
    try {
      for (const accion of this.accionesPorInactividad()) {
        // En serie a propósito: cada jugada forzada se apoya en el estado que dejó la anterior.
        // oxlint-disable-next-line no-await-in-loop
        const resultado = await this.enviar(accion, true);
        if (!resultado.ok) {
          this.logger.warn(`El motor rechazó la jugada por inactividad (${resultado.motivo})`);
        }
      }
    } catch (error: unknown) {
      const mensaje = error instanceof Error ? error.message || error.name : String(error);
      this.logger.error(`Falló la jugada por inactividad: ${mensaje}`);
    }
    // Si nada cambió (se rechazó), se vuelve a intentar al vencer otra vez.
    if (this.actual.version === version) this.programarReloj();
  }

  private accionesPorInactividad(): Accion[] {
    const estado = this.actual;
    if (estado.fase === 'DESCARTE') {
      return Object.keys(estado.descartesPendientes).map((jugador) => ({
        tipo: 'DESCARTE_AUTOMATICO',
        jugador,
      }));
    }
    const indice =
      estado.fase === 'CONSTRUCCION_ESPECIAL' ? estado.turnoEspecialDe : estado.turnoDe;
    const jugador = indice === null ? undefined : estado.jugadores[indice]?.id;
    return jugador === undefined ? [] : [{ tipo: 'SALTAR_TURNO_POR_INACTIVIDAD', jugador }];
  }

  /** Un fallo al guardar se registra: la jugada ya es válida y los demás deben enterarse. */
  private persistir(estado: Estado): void {
    const fallo = (error: unknown): void => {
      const mensaje = error instanceof Error ? error.message || error.name : String(error);
      this.logger.error(
        `No se pudo guardar la partida: ${mensaje}`,
        error instanceof Error ? error.stack : undefined,
      );
    };
    try {
      const pendiente = this.opciones.alCambiar?.(estado);
      if (pendiente instanceof Promise) pendiente.catch(fallo);
    } catch (error: unknown) {
      fallo(error);
    }
  }

  /** Un suscriptor roto (p. ej. un socket caído) no debe frenar a los demás ni deshacer la jugada. */
  private avisar(escucha: Escucha, notificacion: Notificacion): void {
    try {
      escucha(notificacion);
    } catch (error: unknown) {
      const quien = notificacion.observador ?? 'espectador';
      const mensaje = error instanceof Error ? error.message || error.name : String(error);
      this.logger.error(
        `Falló un suscriptor de "${quien}": ${mensaje}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
