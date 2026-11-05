import { decidir } from './decidir.js';
import { evolucionar } from './evolucionar.js';
import type { Mesa } from './mesa.js';
import type { Accion, Estado, Resultado } from './tipos.js';

/** Decide la acción y, si se acepta, aplica sus eventos en orden; el rechazo se devuelve tal cual. */
export function aplicar(mesa: Mesa, estado: Estado, accion: Accion): Resultado {
  const decision = decidir(mesa, estado, accion);
  if (!decision.ok) return decision;
  return {
    ok: true,
    estado: decision.eventos.reduce(evolucionar, estado),
    eventos: decision.eventos,
  };
}
