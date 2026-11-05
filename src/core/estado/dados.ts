import { uniformInt } from 'pure-rand/distribution/uniformInt';
import type { ModoDados } from '../partida/game-config.js';
import { crearRng, mezclar } from '../reglas/azar.js';

const CARAS = [1, 2, 3, 4, 5, 6] as const;
const COMBINACIONES: readonly (readonly [number, number])[] = CARAS.flatMap((a) =>
  CARAS.map((b) => [a, b] as const),
);

/**
 * Tirada determinista: un flujo de azar propio por `(semilla, indice)`.
 *
 * - `AZAR`: cada tirada es independiente (puede haber rachas).
 * - `EQUILIBRADO`: las tiradas se reparten en bloques de 36 y en cada bloque sale cada una de las
 *   36 combinaciones exactamente una vez, en orden mezclado. No hay estado extra: la posición
 *   dentro del bloque sale del índice, así que sigue siendo reproducible desde la semilla.
 */
export function tirarDados(
  semilla: string,
  indice: number,
  modo: ModoDados = 'AZAR',
): readonly [number, number] {
  if (modo === 'EQUILIBRADO') {
    const bloque = Math.floor(indice / COMBINACIONES.length);
    const bolsa = mezclar(COMBINACIONES, crearRng(`${semilla}:bolsa:${bloque}`));
    const [a, b] = bolsa[indice % COMBINACIONES.length]!;
    return [a, b];
  }
  const rng = crearRng(`${semilla}:dados:${indice}`);
  return [uniformInt(rng, 1, 6), uniformInt(rng, 1, 6)];
}
