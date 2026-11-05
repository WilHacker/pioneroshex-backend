import { decidir } from './decidir.js';
import { evolucionar } from './evolucionar.js';
import type { Mesa } from './mesa.js';
import { desglosePuntos } from './puntos.js';
import type { Accion, Estado, Evento, Resultado } from './tipos.js';

/** Decide la acción y, si se acepta, aplica sus eventos en orden; el rechazo se devuelve tal cual. */
export function aplicar(mesa: Mesa, estado: Estado, accion: Accion): Resultado {
  const decision = decidir(mesa, estado, accion);
  if (!decision.ok) return decision;
  const final = decision.eventos.reduce(evolucionar, estado);
  // La victoria se explica con el estado final: así el desglose incluye lo que cambió en la jugada.
  const eventos = decision.eventos.map((evento): Evento => {
    if (evento.tipo !== 'PARTIDA_GANADA') return evento;
    const { jugador, puntos } = evento;
    return { tipo: 'PARTIDA_GANADA', jugador, puntos, desglose: desglosePuntos(final, jugador) };
  });
  return { ok: true, estado: final, eventos };
}
