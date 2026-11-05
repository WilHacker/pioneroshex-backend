import { uniformInt } from 'pure-rand/distribution/uniformInt';
import { crearRng } from '../reglas/azar.js';

/** Tirada determinista: un flujo de azar propio por `(semilla, indice)`. */
export function tirarDados(semilla: string, indice: number): readonly [number, number] {
  const rng = crearRng(`${semilla}:dados:${indice}`);
  return [uniformInt(rng, 1, 6), uniformInt(rng, 1, 6)];
}
