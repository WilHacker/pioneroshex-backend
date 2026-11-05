import { Logger } from '@nestjs/common';
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

/** Recibe lo que ve un observador tras cada jugada aceptada. */
export type Escucha = (notificacion: Notificacion) => void;

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
  private cola: Promise<unknown> = Promise.resolve();
  /** El tablero no cambia con las jugadas: se calcula una vez. */
  readonly mesaPublica: MesaPublica;

  constructor(
    private readonly mesa: Mesa,
    estadoInicial: Estado,
    private readonly opciones: OpcionesPaso = {},
  ) {
    this.actual = estadoInicial;
    this.mesaPublica = mesaPublica(mesa);
  }

  get estado(): Estado {
    return this.actual;
  }

  /** Encola la acción; la promesa se resuelve cuando le toca y se ha procesado. */
  enviar(accion: Accion): Promise<ResultadoEnvio> {
    const tarea = this.cola.then(() => this.procesar(accion));
    // La cola sigue aunque esta tarea falle; el error le llega igualmente a quien la envió.
    this.cola = tarea.catch(() => undefined);
    return tarea;
  }

  /** Lo que ve `observador` ahora mismo (para quien entra o se reconecta). */
  vista(observador: Observador): Vista {
    return vistaPara(this.actual, observador);
  }

  /** Empieza a recibir notificaciones como `observador`. Devuelve la función para darse de baja. */
  suscribir(observador: Observador, escucha: Escucha): () => void {
    if (observador !== null && !this.actual.jugadores.some((j) => j.id === observador)) {
      throw new Error(`El jugador "${observador}" no participa en la partida`);
    }
    const entrada = { escucha };
    const conjunto = this.escuchas.get(observador) ?? new Set();
    conjunto.add(entrada);
    this.escuchas.set(observador, conjunto);
    return () => {
      const actuales = this.escuchas.get(observador);
      if (!actuales) return;
      actuales.delete(entrada);
      if (actuales.size === 0) this.escuchas.delete(observador);
    };
  }

  private procesar(accion: Accion): ResultadoEnvio {
    const resultado = paso(
      this.mesa,
      this.actual,
      accion,
      [...this.escuchas.keys()],
      this.opciones,
    );
    if (!resultado.ok) return resultado;
    this.actual = resultado.estado;
    for (const notificacion of resultado.notificaciones) {
      // Copia a propósito: un suscriptor puede darse de baja mientras se avisa.
      const destinatarios = [...(this.escuchas.get(notificacion.observador) ?? [])];
      for (const { escucha } of destinatarios) this.avisar(escucha, notificacion);
    }
    return { ok: true, estado: resultado.estado, eventosCompletos: resultado.eventosCompletos };
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
