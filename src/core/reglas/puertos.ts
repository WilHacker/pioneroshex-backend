import { aristasCosteras, type Mapa } from '../mapa/mapa.js';
import { crearRng, mezclar } from './azar.js';
import { RECURSOS, type Recurso } from './recursos.js';

/** `GENERICO` cambia 3:1 cualquier recurso; uno de recurso, 2:1 solo ese recurso. */
export type TipoPuerto = 'GENERICO' | Recurso;

/** Un puerto ocupa una arista de la costa y protege sus dos vértices. */
export interface Puerto {
  readonly arista: string;
  readonly vertices: readonly [string, string];
  readonly tipo: TipoPuerto;
}

export const PUERTOS_CLASICOS: readonly TipoPuerto[] = [
  'GENERICO',
  'GENERICO',
  'GENERICO',
  'GENERICO',
  ...RECURSOS,
];

const RAZON_SIN_PUERTO = 4;
const RAZON_GENERICA = 3;
const RAZON_ESPECIFICA = 2;

/**
 * Reparte los puertos parejo por la costa y baraja sus tipos con la semilla. Las posiciones no
 * dependen de la semilla (como el marco fijo del juego real); los tipos sí. Usa un flujo de azar
 * propio (`semilla:puertos`) para no alterar el reparto del tablero.
 * Exige al menos 2 aristas de costa por puerto, así ningún vértice queda en dos puertos.
 */
export function generarPuertos(
  mapa: Mapa,
  semilla: string,
  tipos: readonly TipoPuerto[] = PUERTOS_CLASICOS,
): readonly Puerto[] {
  const costa = aristasCosteras(mapa);
  if (tipos.length * 2 > costa.length) {
    throw new Error(
      `No caben ${tipos.length} puertos en una costa de ${costa.length} aristas (hacen falta 2 por puerto)`,
    );
  }
  return mezclar(tipos, crearRng(`${semilla}:puertos`)).map((tipo, i) => {
    const arista = costa[Math.floor((i * costa.length) / tipos.length)];
    return { arista: arista.id, vertices: [arista.vertices[0], arista.vertices[1]], tipo };
  });
}

/**
 * Mejor razón de cambio con la banca para un recurso, según los vértices donde el jugador tiene
 * poblado o ciudad: 2:1 con puerto de ese recurso, 3:1 con uno genérico, 4:1 sin puerto.
 */
export function mejorRazon(
  puertos: readonly Puerto[],
  verticesPropios: ReadonlySet<string>,
  recurso: Recurso,
): 2 | 3 | 4 {
  const propios = puertos.filter((p) => p.vertices.some((v) => verticesPropios.has(v)));
  if (propios.some((p) => p.tipo === recurso)) return RAZON_ESPECIFICA;
  if (propios.some((p) => p.tipo === 'GENERICO')) return RAZON_GENERICA;
  return RAZON_SIN_PUERTO;
}
