import { puntosDe } from './puntos.js';
import type { Accion, Decision, Estado, Evento } from './tipos.js';

/**
 * Dejar la partida. Se puede en cualquier fase y fuera de turno. Quien abandona queda en piloto
 * automático hasta el final; si solo queda un jugador sin abandonar, gana él por abandono.
 * Abandonar dos veces no hace nada.
 */
export function decidirAbandono(estado: Estado, accion: Accion): Decision {
  if (accion.tipo !== 'ABANDONAR') return { ok: false, motivo: 'FASE_INCORRECTA' };
  if (estado.abandonados.includes(accion.jugador)) return { ok: true, eventos: [] };

  const eventos: Evento[] = [{ tipo: 'JUGADOR_ABANDONO', jugador: accion.jugador }];
  const abandonados = new Set([...estado.abandonados, accion.jugador]);
  const quedan = estado.jugadores.filter((j) => !abandonados.has(j.id));
  const [unico] = quedan;
  if (unico !== undefined && quedan.length === 1) {
    eventos.push({
      tipo: 'PARTIDA_GANADA',
      jugador: unico.id,
      puntos: puntosDe(estado, unico.id, { incluirOcultos: true }),
      porAbandono: true,
    });
  }
  return { ok: true, eventos };
}
