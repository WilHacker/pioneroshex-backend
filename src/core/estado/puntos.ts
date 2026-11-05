import type { Estado, JugadorId, TipoEdificio } from './tipos.js';

const PUNTOS_POR_EDIFICIO: Readonly<Record<TipoEdificio, number>> = { POBLADO: 1, CIUDAD: 2 };

/** Puntos de victoria visibles de un jugador (poblado 1, ciudad 2). */
export function puntosDe(estado: Estado, jugador: JugadorId): number {
  return Object.values(estado.edificios)
    .filter((e) => e.dueno === jugador)
    .reduce((total, e) => total + PUNTOS_POR_EDIFICIO[e.tipo], 0);
}
