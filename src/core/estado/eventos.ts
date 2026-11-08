import type { Evento, JugadorId, Trato } from './tipos.js';
import { tratoVisiblePara } from './vista.js';

/**
 * Filtra los eventos emitidos según quién los observa.
 * Garantiza que la información secreta (ej. qué recurso se robó con el ladrón)
 * solo sea visible para los jugadores involucrados (ladrón y víctima).
 */
export interface ContextoDeEventos {
  /** En el comercio privado los eventos de un trato solo los reciben los implicados. */
  readonly comercioPrivado: boolean;
  /** Los tratos que había antes de la jugada (para saber de quién es uno ya existente). */
  readonly tratos: readonly Trato[];
  /** Regla «ocultar banco»: no se cuenta cuánto quedaba en el banco. */
  readonly ocultarBanco: boolean;
  /** Regla «cartas a la vista»: lo que se roba lo ve cualquiera, las manos ya son públicas. */
  readonly manosVisibles: boolean;
}

const SIN_REGLAS: ContextoDeEventos = {
  comercioPrivado: false,
  tratos: [],
  ocultarBanco: false,
  manosVisibles: false,
};

/** ¿Es `observador` parte del trato al que se refiere el evento? Sin dato, no. */
function participaEnElTrato(
  evento: Evento,
  observador: JugadorId | null,
  tratos: readonly Trato[],
): boolean {
  if (evento.tipo === 'TRATO_PROPUESTO')
    return tratoVisiblePara('PRIVADO', evento.trato, observador);
  if (evento.tipo === 'TRATO_ACEPTADO') {
    return (
      observador !== null && (observador === evento.proponente || observador === evento.aceptante)
    );
  }
  if (evento.tipo === 'TRATO_RECHAZADO' || evento.tipo === 'TRATO_CANCELADO') {
    const trato = tratos.find((t) => t.id === evento.tratoId);
    return trato !== undefined && tratoVisiblePara('PRIVADO', trato, observador);
  }
  return true;
}

const ES_DE_TRATO: ReadonlySet<Evento['tipo']> = new Set([
  'TRATO_PROPUESTO',
  'TRATO_ACEPTADO',
  'TRATO_RECHAZADO',
  'TRATO_CANCELADO',
]);

export function eventosPara(
  eventos: readonly Evento[],
  observador: JugadorId | null,
  contexto: ContextoDeEventos = SIN_REGLAS,
): readonly Evento[] {
  const visibles = contexto.comercioPrivado
    ? eventos.filter(
        (e) => !ES_DE_TRATO.has(e.tipo) || participaEnElTrato(e, observador, contexto.tratos),
      )
    : eventos;
  return visibles.map((evento) => {
    if (evento.tipo === 'PRODUCCION_BLOQUEADA' && contexto.ocultarBanco) {
      return { ...evento, disponible: null };
    }
    if (evento.tipo === 'CARTA_ROBADA') {
      if (
        contexto.manosVisibles ||
        (observador !== null && (observador === evento.ladron || observador === evento.victima))
      ) {
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
      if (
        contexto.manosVisibles ||
        (observador !== null && (observador === evento.jugador || observador === evento.victima))
      ) {
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
