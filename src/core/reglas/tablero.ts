import { distancia, type Hex } from '../mapa/coordenadas.js';
import type { Mapa } from '../mapa/mapa.js';
import { crearRng, mezclar } from './azar.js';

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

// ponytail: reparto por rechazo (se baraja y se descarta si hay 6 y 8 juntos). Con el mapa clásico
// acierta en pocos intentos; para mapas enormes o muy cargados de 6 y 8, pasar a un reparto
// constructivo con retroceso.
const MAX_INTENTOS = 1000;

const esCaliente = (ficha: number | null): boolean => ficha === 6 || ficha === 8;

function hayCalientesJuntas(casillas: readonly CasillaTablero[]): boolean {
  const calientes = casillas.filter((c) => esCaliente(c.ficha));
  return calientes.some((a, i) =>
    calientes.slice(i + 1).some((b) => distancia(a.hex, b.hex) === 1),
  );
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
  distribucion: Distribucion = DISTRIBUCION_CLASICA,
): Tablero {
  validarDistribucion(mapa, distribucion);
  const rng = crearRng(semilla);

  const terrenos = mezclar(
    TERRENOS.flatMap((t) => Array.from({ length: distribucion.terrenos[t] }, () => t)),
    rng,
  );

  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    const fichas = mezclar(distribucion.fichas, rng);
    let siguiente = 0;
    const casillas = mapa.casillas.map((hex, i): CasillaTablero => {
      const terreno = terrenos[i];
      return { hex, terreno, ficha: terreno === 'DESIERTO' ? null : fichas[siguiente++] };
    });
    if (!hayCalientesJuntas(casillas)) {
      return { casillas, ladron: casillas.find((c) => c.terreno === 'DESIERTO')?.hex ?? null };
    }
  }
  throw new Error(
    `No se pudo separar el 6 y el 8 tras ${MAX_INTENTOS} intentos: la distribución es demasiado apretada`,
  );
}
