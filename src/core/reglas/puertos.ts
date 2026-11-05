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

const ARISTAS_COSTA_CLASICA = 30;
const PUERTOS_POR_10_ARISTAS = 3;

/**
 * Tipos de puerto para una costa de `aristas` aristas: 3 puertos por cada 10 aristas, con el
 * mismo número de puertos de cada recurso (1 en el clásico, más en costas largas) y el resto
 * genéricos. Con 30 aristas da el reparto clásico. Una costa que no aguanta ni un juego completo
 * (un puerto por recurso, 2 aristas cada uno) no lleva puertos.
 */
export function tiposDePuertosParaCosta(aristas: number): readonly TipoPuerto[] {
  if (!Number.isInteger(aristas) || aristas < 0) {
    throw new Error(`La costa debe tener un número entero de aristas, no ${aristas}`);
  }
  if (Math.floor(aristas / 2) < RECURSOS.length) return [];
  const porRecurso = Math.max(1, Math.round(aristas / ARISTAS_COSTA_CLASICA));
  const total = Math.max(
    RECURSOS.length * porRecurso,
    Math.round((aristas * PUERTOS_POR_10_ARISTAS) / 10),
  );
  const genericos = Array.from({ length: total - RECURSOS.length * porRecurso }, () => 'GENERICO');
  return [
    ...genericos,
    ...Array.from({ length: porRecurso }, () => RECURSOS).flat(),
  ] as TipoPuerto[];
}

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
  tiposPropios?: readonly TipoPuerto[],
): readonly Puerto[] {
  const costa = aristasCosteras(mapa);
  const tipos = tiposPropios ?? tiposDePuertosParaCosta(costa.length);
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
