import { uniformInt } from 'pure-rand/distribution/uniformInt';
import { xoroshiro128plus } from 'pure-rand/generator/xoroshiro128plus';
import { semillaDesdeTexto } from './semilla.js';

export type Rng = ReturnType<typeof xoroshiro128plus>;

/**
 * Generador determinista a partir de un texto de semilla. Es mutable (cada uso lo hace avanzar):
 * créalo dentro de la función que lo consume y no lo compartas.
 */
export function crearRng(semilla: string): Rng {
  return xoroshiro128plus(semillaDesdeTexto(semilla));
}

/** Fisher-Yates sobre una copia; el generador avanza, la entrada no se toca. */
export function mezclar<T>(items: readonly T[], rng: Rng): T[] {
  const resultado = [...items];
  for (let i = resultado.length - 1; i > 0; i--) {
    const j = uniformInt(rng, 0, i);
    [resultado[i], resultado[j]] = [resultado[j], resultado[i]];
  }
  return resultado;
}
