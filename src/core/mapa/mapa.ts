import { DIRECCIONES, type Hex, casillasPorRadio, clave, sumar } from './coordenadas.js';

/** Intersección. La comparten hasta 3 casillas; `casillas` solo incluye las que están en el tablero. */
export interface Vertice {
  readonly id: string;
  readonly casillas: readonly Hex[];
  /** Ids de los vértices unidos a este por una arista (2 o 3). */
  readonly vecinos: readonly string[];
}

/** Borde entre dos vértices. */
export interface Arista {
  readonly id: string;
  readonly vertices: readonly [string, string];
}

export interface Mapa {
  readonly radio: number;
  readonly casillas: readonly Hex[];
  readonly vertices: readonly Vertice[];
  readonly aristas: readonly Arista[];
}

/**
 * Id de la esquina `i` de la casilla `h`: la esquina `i` queda entre las direcciones `i` e `i+1`,
 * así que la comparten `h` y esos dos vecinos (que son vecinos entre sí). El id es el trío de
 * claves ordenado, igual venga de la casilla que venga; sirve también para casillas fuera del
 * tablero y no depende de decimales.
 */
function idVertice(h: Hex, i: number): string {
  const a = sumar(h, DIRECCIONES[i]);
  const b = sumar(h, DIRECCIONES[(i + 1) % 6]);
  return [clave(h), clave(a), clave(b)].toSorted().join('|');
}

/** Los 6 vértices de una casilla en orden cíclico: los consecutivos (y el último con el primero) comparten arista. */
export function verticesDeCasilla(h: Hex): readonly string[] {
  return DIRECCIONES.map((_, i) => idVertice(h, i));
}

/** Dos vértices determinan una única arista. */
function idArista(a: string, b: string): string {
  return [a, b].toSorted().join('~');
}

/** Construye el tablero hexagonal de radio `radio` sin vértices ni aristas duplicados. */
export function crearMapa(radio: number): Mapa {
  if (!Number.isInteger(radio) || radio < 0) {
    throw new Error(`El radio del mapa debe ser un entero mayor o igual a 0 (recibido: ${radio})`);
  }

  const casillas = casillasPorRadio(radio);
  // Acumuladores locales: se construyen aquí y salen como estructuras de solo lectura.
  const acumulado = new Map<string, { casillas: Hex[]; vecinos: Set<string> }>();
  const aristas = new Map<string, Arista>();
  const obtener = (id: string) => {
    const existente = acumulado.get(id);
    if (existente) return existente;
    const nuevo = { casillas: [] as Hex[], vecinos: new Set<string>() };
    acumulado.set(id, nuevo);
    return nuevo;
  };

  for (const casilla of casillas) {
    const ids = verticesDeCasilla(casilla);
    ids.forEach((id, i) => {
      const anterior = ids[(i + 5) % 6];
      obtener(id).casillas.push(casilla);
      obtener(id).vecinos.add(anterior);
      obtener(anterior).vecinos.add(id);

      const idAr = idArista(anterior, id);
      if (!aristas.has(idAr)) aristas.set(idAr, { id: idAr, vertices: [anterior, id] });
    });
  }

  const vertices = [...acumulado].map(([id, v]) => ({
    id,
    casillas: v.casillas,
    vecinos: [...v.vecinos],
  }));

  return { radio, casillas, vertices, aristas: [...aristas.values()] };
}
