import { decidir } from './decidir.js';
import type { Mesa } from './mesa.js';
import type { Accion, Estado, ResultadoRegla } from './tipos.js';

/**
 * «¿Puedo hacer esto?»: `{ ok: true }` o el rechazo con su motivo y sus datos (`falta`, `detalle`).
 * Es lo que la interfaz pide cuando el jugador toca un lugar concreto. Usa la misma `decidir` que
 * ejecuta la jugada, así que la explicación nunca contradice al juego. No muta nada y, a
 * diferencia de `accionesDisponibles`, no lanza con un jugador desconocido: devuelve el motivo.
 */
export function explicarAccion(mesa: Mesa, estado: Estado, accion: Accion): ResultadoRegla {
  const decision = decidir(mesa, estado, accion);
  return decision.ok ? { ok: true } : decision;
}
