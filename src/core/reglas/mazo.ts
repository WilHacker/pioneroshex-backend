import { JUGADORES_MAX, JUGADORES_MIN } from '../partida/game-config.js';
import { crearRng, mezclar } from './azar.js';

/** Nombres en español provisionales (ver Backlog). */
export type CartaDesarrollo =
  'CABALLERO' | 'PUNTO_VICTORIA' | 'CONSTRUCCION_CARRETERAS' | 'ABUNDANCIA' | 'MONOPOLIO';

/** Orden fijo: el mazo debe armarse igual en cualquier máquina. */
const CARTAS: readonly CartaDesarrollo[] = [
  'CABALLERO',
  'PUNTO_VICTORIA',
  'CONSTRUCCION_CARRETERAS',
  'ABUNDANCIA',
  'MONOPOLIO',
];

/** Mazo base de 25 cartas, el de 3 a 4 jugadores. */
export const CARTAS_BASE: Readonly<Record<CartaDesarrollo, number>> = Object.freeze({
  CABALLERO: 14,
  PUNTO_VICTORIA: 5,
  CONSTRUCCION_CARRETERAS: 2,
  ABUNDANCIA: 2,
  MONOPOLIO: 2,
});

const JUGADORES_POR_MAZO = 4;

function validarJugadores(jugadores: number): void {
  if (!Number.isInteger(jugadores) || jugadores < JUGADORES_MIN || jugadores > JUGADORES_MAX) {
    throw new Error(
      `El número de jugadores debe ser un entero entre ${JUGADORES_MIN} y ${JUGADORES_MAX}, no ${jugadores}`,
    );
  }
}

/** Cuántas cartas de cada tipo lleva el mazo: el base multiplicado por `ceil(jugadores / 4)`. */
export function composicionDelMazo(jugadores: number): Record<CartaDesarrollo, number> {
  validarJugadores(jugadores);
  const veces = Math.ceil(jugadores / JUGADORES_POR_MAZO);
  return {
    CABALLERO: CARTAS_BASE.CABALLERO * veces,
    PUNTO_VICTORIA: CARTAS_BASE.PUNTO_VICTORIA * veces,
    CONSTRUCCION_CARRETERAS: CARTAS_BASE.CONSTRUCCION_CARRETERAS * veces,
    ABUNDANCIA: CARTAS_BASE.ABUNDANCIA * veces,
    MONOPOLIO: CARTAS_BASE.MONOPOLIO * veces,
  };
}

/**
 * Mazo barajado, listo para robar de arriba abajo. Es determinista: la misma semilla da el mismo
 * orden. Usa un flujo de azar propio (`semilla:mazo`) para no alterar el tablero ni los puertos.
 */
export function crearMazo(jugadores: number, semilla: string): readonly CartaDesarrollo[] {
  const composicion = composicionDelMazo(jugadores);
  const cartas = CARTAS.flatMap((carta) => Array.from({ length: composicion[carta] }, () => carta));
  return mezclar(cartas, crearRng(`${semilla}:mazo`));
}
