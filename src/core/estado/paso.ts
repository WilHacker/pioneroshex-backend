import { accionesDisponibles, type AccionDisponible } from './acciones.js';
import { aplicar } from './aplicar.js';
import { eventosPara } from './eventos.js';
import type { Mesa } from './mesa.js';
import type { Accion, Estado, Evento, JugadorId, Rechazo } from './tipos.js';
import { vistaPara, type Vista } from './vista.js';

/** Quién mira: un jugador, o `null` para un espectador (modo lectura). */
export type Observador = JugadorId | null;

/** Lo que se le envía a un observador tras una jugada. Nada de aquí es secreto para él. */
export interface Notificacion {
  readonly observador: Observador;
  readonly vista: Vista;
  readonly eventos: readonly Evento[];
  /** Vacío si no se pidió, si es espectador o si la partida terminó. */
  readonly acciones: readonly AccionDisponible[];
}

export type ResultadoPaso =
  | {
      readonly ok: true;
      readonly estado: Estado;
      /**
       * Todos los eventos sin filtrar, con los secretos. SOLO para el servidor (guardar, auditar):
       * nunca se envía a un cliente. A los clientes les llega `notificaciones`.
       */
      readonly eventosCompletos: readonly Evento[];
      readonly notificaciones: readonly Notificacion[];
    }
  | Rechazo;

export interface OpcionesPaso {
  /** Calcula `accionesDisponibles` de cada jugador (cuesta unos ms por jugador): solo si hace falta. */
  readonly incluirAcciones?: boolean;
}

/**
 * Un paso de la partida de punta a punta: valida y aplica `accion`, y prepara lo que se envía a
 * cada observador (vista y eventos filtrados por `eventosPara`, y opcionalmente sus acciones).
 * Es lo único que necesita el actor por partida: no toca red ni reloj. Si la jugada se rechaza
 * devuelve el rechazo y nada más. Lanza si un observador no participa (error de quien llama).
 */
export function paso(
  mesa: Mesa,
  estado: Estado,
  accion: Accion,
  observadores: readonly Observador[],
  opciones: OpcionesPaso = {},
): ResultadoPaso {
  const unicos = [...new Set(observadores)];
  for (const observador of unicos) {
    if (observador !== null && !estado.jugadores.some((j) => j.id === observador)) {
      throw new Error(`El jugador "${observador}" no participa en la partida`);
    }
  }
  const resultado = aplicar(mesa, estado, accion);
  if (!resultado.ok) return resultado;

  const { estado: nuevo, eventos } = resultado;
  const conAcciones = opciones.incluirAcciones === true && nuevo.fase !== 'FIN';
  return {
    ok: true,
    estado: nuevo,
    eventosCompletos: eventos,
    notificaciones: unicos.map((observador): Notificacion => ({
      observador,
      vista: vistaPara(nuevo, observador),
      eventos: eventosPara(eventos, observador),
      acciones:
        conAcciones && observador !== null ? accionesDisponibles(mesa, nuevo, observador) : [],
    })),
  };
}
