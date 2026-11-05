import type { Evento, JugadorId } from './tipos.js';

/**
 * Filtra los eventos emitidos según quién los observa.
 * Garantiza que la información secreta (ej. qué recurso se robó con el ladrón)
 * solo sea visible para los jugadores involucrados (ladrón y víctima).
 */
export function eventosPara(
  eventos: readonly Evento[],
  observador: JugadorId | null,
): readonly Evento[] {
  return eventos.map((evento) => {
    if (evento.tipo === 'CARTA_ROBADA') {
      if (observador !== null && (observador === evento.ladron || observador === evento.victima)) {
        return { ...evento };
      }
      return {
        ...evento,
        recurso: null,
      };
    }
    if (evento.tipo === 'CARTA_DESARROLLO_COMPRADA') {
      if (observador !== null && observador === evento.jugador) {
        return { ...evento };
      }
      return {
        ...evento,
        carta: null,
      };
    }
    if (evento.tipo === 'CABALLERO_JUGADO') {
      if (observador !== null && (observador === evento.jugador || observador === evento.victima)) {
        return { ...evento };
      }
      return {
        ...evento,
        recursoRobado: null,
      };
    }
    return { ...evento };
  });
}
