import { distancia, type Hex } from '../mapa/coordenadas.js';
import type { Mapa } from '../mapa/mapa.js';
import { crearRng, mezclar, type Rng } from './azar.js';

/** Nombres en español provisionales (ver Backlog). */
export type Terreno = 'BOSQUE' | 'PASTO' | 'CAMPO' | 'COLINA' | 'MONTANA' | 'DESIERTO';

/** Orden fijo: el reparto debe ser el mismo en cualquier máquina. */
const TERRENOS: readonly Terreno[] = ['BOSQUE', 'PASTO', 'CAMPO', 'COLINA', 'MONTANA', 'DESIERTO'];

export interface Distribucion {
  /** Cuántas casillas de cada terreno; deben sumar las casillas del mapa. */
  readonly terrenos: Readonly<Record<Terreno, number>>;
  /** Una ficha por casilla que no sea desierto. */
  readonly fichas: readonly number[];
}

export interface CasillaTablero {
  readonly hex: Hex;
  readonly terreno: Terreno;
  /** `null` en el desierto. */
  readonly ficha: number | null;
}

export interface Tablero {
  /** En el mismo orden que `mapa.casillas`. */
  readonly casillas: readonly CasillaTablero[];
  /** Casilla donde empieza el ladrón (el desierto), o `null` si el mapa no tiene. */
  readonly ladron: Hex | null;
}

export const DISTRIBUCION_CLASICA: Distribucion = {
  terrenos: { BOSQUE: 4, PASTO: 4, CAMPO: 4, COLINA: 3, MONTANA: 3, DESIERTO: 1 },
  fichas: [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12],
};

/** Peso de cada recurso en el reparto clásico (suman 18 casillas productivas). */
const PESOS_RECURSOS: readonly (readonly [Terreno, number])[] = [
  ['BOSQUE', 4],
  ['PASTO', 4],
  ['CAMPO', 4],
  ['COLINA', 3],
  ['MONTANA', 3],
];
const PRODUCTIVAS_CLASICAS = 18;
const CASILLAS_POR_DESIERTO = 19;

/**
 * Fichas en el orden en que se reparten al crecer el mapa: cada vuelta completa repite el juego
 * clásico (18 fichas) y una vuelta a medias corta por el final, donde están el 2 y el 12.
 */
const ORDEN_FICHAS: readonly number[] = [3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 2, 12];

/** Reparte `productivas` casillas entre los recursos con el método del resto mayor. */
function repartirRecursos(productivas: number): Record<Terreno, number> {
  const cuotas = PESOS_RECURSOS.map(([terreno, peso], orden) => ({
    terreno,
    orden,
    base: Math.floor((productivas * peso) / PRODUCTIVAS_CLASICAS),
    resto: (productivas * peso) % PRODUCTIVAS_CLASICAS,
  }));
  const sobrantes = productivas - cuotas.reduce((suma, c) => suma + c.base, 0);
  const conExtra = new Set(
    cuotas
      .toSorted((a, b) => b.resto - a.resto || a.orden - b.orden)
      .slice(0, sobrantes)
      .map((c) => c.terreno),
  );
  const terrenos = { BOSQUE: 0, PASTO: 0, CAMPO: 0, COLINA: 0, MONTANA: 0, DESIERTO: 0 };
  for (const c of cuotas) terrenos[c.terreno] = c.base + (conExtra.has(c.terreno) ? 1 : 0);
  return terrenos;
}

/**
 * Distribución para un mapa de `casillas` casillas. Con 19 es exactamente la clásica; con más
 * crece en proporción: un desierto por cada 19 casillas (mínimo 1), los recursos con los mismos
 * pesos del clásico y las fichas repitiendo el juego clásico.
 */
export function distribucionParaCasillas(casillas: number): Distribucion {
  if (!Number.isInteger(casillas) || casillas < 1) {
    throw new Error(`El mapa necesita un número entero de casillas (al menos 1), no ${casillas}`);
  }
  const desiertos = Math.max(1, Math.round(casillas / CASILLAS_POR_DESIERTO));
  const productivas = Math.max(0, casillas - desiertos);
  const fichas = Array.from(
    { length: productivas },
    (_, i) => ORDEN_FICHAS[i % ORDEN_FICHAS.length],
  ).toSorted((a, b) => a - b);
  return { terrenos: { ...repartirRecursos(productivas), DESIERTO: desiertos }, fichas };
}

// ponytail: reparto "voraz aleatorio" de los 6 y 8 (se eligen casillas al azar que no se toquen
// hasta colocarlos todos; si se atasca, se reintenta con otro orden). Sirve para cualquier mapa
// razonable; con muchísimos 6 y 8 por casilla (más de ~1 de cada 4) puede atascarse siempre y
// fallar con error claro: habría que pasar a un reparto exacto con retroceso.
const MAX_INTENTOS = 1000;

const esCaliente = (ficha: number): boolean => ficha === 6 || ficha === 8;

/**
 * Fichas por casilla productiva (mismo orden que `hexes`), con ningún 6 u 8 junto a otro 6 u 8.
 * Devuelve `null` si el orden elegido se atasca antes de colocar todas las calientes.
 */
function repartirFichas(
  hexes: readonly Hex[],
  fichas: readonly number[],
  rng: Rng,
): readonly number[] | null {
  const calientes = fichas.filter(esCaliente);
  const normales = fichas.filter((f) => !esCaliente(f));
  const orden = mezclar(
    hexes.map((_, i) => i),
    rng,
  );

  const elegidas: number[] = [];
  for (const i of orden) {
    if (elegidas.length === calientes.length) break;
    if (elegidas.every((j) => distancia(hexes[i], hexes[j]) > 1)) elegidas.push(i);
  }
  if (elegidas.length < calientes.length) return null;

  const fichaEn = new Map<number, number>();
  mezclar(calientes, rng).forEach((ficha, k) => fichaEn.set(elegidas[k], ficha));
  const libres = orden.filter((i) => !fichaEn.has(i));
  mezclar(normales, rng).forEach((ficha, k) => fichaEn.set(libres[k], ficha));
  return hexes.map((_, i) => fichaEn.get(i) as number);
}

function validarDistribucion(mapa: Mapa, distribucion: Distribucion): void {
  const totalTerrenos = TERRENOS.reduce((suma, t) => suma + distribucion.terrenos[t], 0);
  if (totalTerrenos !== mapa.casillas.length) {
    throw new Error(
      `Los terrenos suman ${totalTerrenos} pero el mapa tiene ${mapa.casillas.length} casillas`,
    );
  }
  const productivas = mapa.casillas.length - distribucion.terrenos.DESIERTO;
  if (distribucion.fichas.length !== productivas) {
    throw new Error(
      `Hay ${distribucion.fichas.length} fichas pero ${productivas} casillas productivas`,
    );
  }
}

/**
 * Reparte terrenos y fichas sobre el mapa. Es determinista: la misma semilla da el mismo tablero.
 * Garantiza que ningún 6 queda junto a un 8 (ni a otro 6, ni un 8 junto a otro 8).
 */
export function generarTablero(
  mapa: Mapa,
  semilla: string,
  distribucion: Distribucion = distribucionParaCasillas(mapa.casillas.length),
): Tablero {
  validarDistribucion(mapa, distribucion);
  const rng = crearRng(semilla);

  const terrenos = mezclar(
    TERRENOS.flatMap((t) => Array.from({ length: distribucion.terrenos[t] }, () => t)),
    rng,
  );

  const productivas = mapa.casillas.filter((_, i) => terrenos[i] !== 'DESIERTO');
  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    const fichas = repartirFichas(productivas, distribucion.fichas, rng);
    if (fichas === null) continue;
    let siguiente = 0;
    const casillas = mapa.casillas.map((hex, i): CasillaTablero => {
      const terreno = terrenos[i];
      return { hex, terreno, ficha: terreno === 'DESIERTO' ? null : fichas[siguiente++] };
    });
    return { casillas, ladron: casillas.find((c) => c.terreno === 'DESIERTO')?.hex ?? null };
  }
  throw new Error(
    `No se pudo separar el 6 y el 8 tras ${MAX_INTENTOS} intentos: la distribución es demasiado apretada`,
  );
}
