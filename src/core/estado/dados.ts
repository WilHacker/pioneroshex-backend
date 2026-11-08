import { uniformInt } from 'pure-rand/distribution/uniformInt';
import type { ModoDados } from '../partida/game-config.js';
import { crearRng, mezclar } from '../reglas/azar.js';

const CARAS = [1, 2, 3, 4, 5, 6] as const;
const COMBINACIONES: readonly (readonly [number, number])[] = CARAS.flatMap((a) =>
  CARAS.map((b) => [a, b] as const),
);

/** Cuántas cartas se roban de la baraja de 36 antes de volver a barajarla (quedan 13 sin ver). */
const TANDA_BARAJA = 23;
/** Defensa: reintentos al evitar una racha o un 7; con una probabilidad tan baja nunca se agotan. */
const REINTENTOS_MAX = 50;

const suma = (d: readonly [number, number]): number => d[0] + d[1];

export interface ReglasDeDados {
  /** Las primeras tiradas (0 = ninguna) en las que no puede salir un 7. */
  readonly sinSieteHasta?: number;
}

/** Dos dados independientes: un flujo de azar propio por `(semilla, indice, sufijo)`. */
function azar(semilla: string, indice: number, sufijo = ''): readonly [number, number] {
  const rng = crearRng(`${semilla}:dados:${indice}${sufijo}`);
  return [uniformInt(rng, 1, 6), uniformInt(rng, 1, 6)];
}

/** Sin que el mismo total salga tres veces seguidas; recorre la secuencia desde el principio. */
function sinRachas(semilla: string, indice: number): readonly [number, number] {
  const totales: number[] = [];
  let tirada = azar(semilla, 0);
  for (let i = 0; i <= indice; i++) {
    tirada = azar(semilla, i);
    for (let k = 0; k < REINTENTOS_MAX && i >= 2; k++) {
      const total = suma(tirada);
      if (total !== totales[i - 1] || total !== totales[i - 2]) break;
      tirada = azar(semilla, i, `:racha${k}`);
    }
    totales.push(suma(tirada));
  }
  return tirada;
}

function cruda(semilla: string, indice: number, modo: ModoDados): readonly [number, number] {
  switch (modo) {
    case 'EQUILIBRADO': {
      const bloque = Math.floor(indice / COMBINACIONES.length);
      const bolsa = mezclar(COMBINACIONES, crearRng(`${semilla}:bolsa:${bloque}`));
      const [a, b] = bolsa[indice % COMBINACIONES.length]!;
      return [a, b];
    }
    case 'BARAJA': {
      const tanda = Math.floor(indice / TANDA_BARAJA);
      const baraja = mezclar(COMBINACIONES, crearRng(`${semilla}:baraja:${tanda}`));
      const [a, b] = baraja[indice % TANDA_BARAJA]!;
      return [a, b];
    }
    case 'SIN_RACHAS':
      return sinRachas(semilla, indice);
    default:
      return azar(semilla, indice);
  }
}

/**
 * Tirada determinista: un flujo de azar propio por `(semilla, indice)`, así que se reproduce desde
 * la semilla sin guardar estado.
 *
 * - `AZAR`: cada tirada es independiente (puede haber rachas).
 * - `EQUILIBRADO`: en bloques de 36 tiradas sale cada combinación exactamente una vez.
 * - `BARAJA`: como sacar cartas de una baraja de 36 sin devolverlas, y se rebaraja cuando quedan 13:
 *   así no se pueden contar las que faltan.
 * - `SIN_RACHAS`: azar, pero el mismo total no sale tres veces seguidas.
 *
 * `sinSieteHasta`: en las primeras tiradas un 7 se vuelve a tirar (arranque protegido).
 */
export function tirarDados(
  semilla: string,
  indice: number,
  modo: ModoDados = 'AZAR',
  reglas: ReglasDeDados = {},
): readonly [number, number] {
  const tirada = cruda(semilla, indice, modo);
  if (indice >= (reglas.sinSieteHasta ?? 0) || suma(tirada) !== 7) return tirada;
  for (let k = 0; k < REINTENTOS_MAX; k++) {
    const otra = azar(semilla, indice, `:sin7:${k}`);
    if (suma(otra) !== 7) return otra;
  }
  return [1, 2];
}
