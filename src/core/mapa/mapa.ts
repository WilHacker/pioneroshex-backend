import {
  DIRECCIONES,
  type Hex,
  casillasPorRadio,
  clave,
  distancia,
  hex,
  sumar,
} from './coordenadas.js';
import { posicionDeVertice } from './geometria.js';

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
  /** Mayor distancia de una casilla al centro (0,0). En un hexágono por radio es su radio. */
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
  return crearMapaDesdeCasillas(casillasPorRadio(radio));
}

/**
 * Construye el mapa de cualquier lista de casillas (con huecos o lagos incluidos) sin vértices ni
 * aristas duplicados. No exige que la tierra sea un solo trozo: eso lo valida el catálogo de mapas.
 */
export function crearMapaDesdeCasillas(lista: readonly Hex[]): Mapa {
  if (lista.length === 0) throw new Error('El mapa necesita al menos una casilla');
  const vistas = new Set<string>();
  for (const c of lista) {
    if (!Number.isInteger(c.q) || !Number.isInteger(c.r) || c.q + c.r + c.s !== 0) {
      throw new Error(`La casilla (${c.q}, ${c.r}, ${c.s}) no cumple q + r + s = 0`);
    }
    if (vistas.has(clave(c))) throw new Error(`Casilla repetida en el mapa: ${clave(c)}`);
    vistas.add(clave(c));
  }

  const casillas = lista.map((c) => hex(c.q, c.r));
  const radio = Math.max(...casillas.map((c) => distancia(c, hex(0, 0))));
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

/** Verdadero si desde cualquier casilla se llega a todas pasando solo por casillas vecinas. */
export function tierraConectada(mapa: Mapa): boolean {
  const pendientes = new Set(mapa.casillas.map(clave));
  const porVisitar = [mapa.casillas[0]];
  pendientes.delete(clave(mapa.casillas[0]));
  for (let actual = porVisitar.pop(); actual; actual = porVisitar.pop()) {
    for (const vecina of DIRECCIONES.map((d) => sumar(actual, d))) {
      if (pendientes.delete(clave(vecina))) porVisitar.push(vecina);
    }
  }
  return pendientes.size === 0;
}

/** Recorre un ciclo de costa desde `inicio`; lanza si no se cierra. */
function recorrerCiclo(
  inicio: Arista,
  porVertice: ReadonlyMap<string, readonly Arista[]>,
  visitadas: Set<string>,
): readonly Arista[] {
  const ciclo = [inicio];
  visitadas.add(inicio.id);
  let extremo = inicio.vertices[1];
  for (;;) {
    const siguiente = (porVertice.get(extremo) ?? []).find((a) => !visitadas.has(a.id));
    if (!siguiente) break;
    ciclo.push(siguiente);
    visitadas.add(siguiente.id);
    extremo = siguiente.vertices[0] === extremo ? siguiente.vertices[1] : siguiente.vertices[0];
  }
  // Recorrer todas las aristas no basta: un camino abierto también se recorre entero.
  if (extremo !== inicio.vertices[0])
    throw new Error('El borde del mapa no forma un ciclo cerrado');
  return ciclo;
}

export interface Costas {
  /** El borde que rodea todo el mapa, en orden alrededor del perímetro. */
  readonly exterior: readonly Arista[];
  /** La orilla de cada lago (hueco rodeado de tierra), cada una en orden. */
  readonly interiores: readonly (readonly Arista[])[];
}

/**
 * Las costas del mapa: las aristas que tocan una sola casilla, agrupadas en ciclos cerrados (cada
 * vértice costero tiene exactamente 2). El **exterior** es el ciclo que contiene el vértice más
 * al norte (y al oeste, si hay empate) de todo el mapa: un lago nunca contiene el punto extremo.
 * Cada ciclo arranca en su primera arista según el orden de `mapa.aristas` y avanza en el mismo
 * sentido de siempre, así el hexágono de radio R mantiene el orden que tenía.
 * Lanza si la tierra no está conectada (no hay un único exterior) o si un borde no se cierra.
 */
export function costasDelMapa(mapa: Mapa): Costas {
  if (!tierraConectada(mapa)) throw new Error('La tierra del mapa no está conectada');
  const porId = new Map(mapa.vertices.map((v) => [v.id, v]));
  const esCostera = (arista: Arista): boolean => {
    const [x, y] = arista.vertices.map((id) => (porId.get(id)?.casillas ?? []).map(clave));
    return x.filter((c) => y.includes(c)).length === 1;
  };

  const costeras = mapa.aristas.filter(esCostera);
  if (costeras.length === 0) return { exterior: [], interiores: [] };

  const porVertice = new Map<string, Arista[]>();
  for (const arista of costeras) {
    for (const v of arista.vertices) porVertice.set(v, [...(porVertice.get(v) ?? []), arista]);
  }

  const visitadas = new Set<string>();
  const ciclos: (readonly Arista[])[] = [];
  for (const arista of costeras) {
    if (!visitadas.has(arista.id)) ciclos.push(recorrerCiclo(arista, porVertice, visitadas));
  }

  const masAlNorte = [...porVertice.keys()].reduce((mejor, id) => {
    const a = posicionDeVertice(id);
    const b = posicionDeVertice(mejor);
    return a.y < b.y || (a.y === b.y && a.x < b.x) ? id : mejor;
  });
  const exterior = ciclos.find((c) => c.some((a) => a.vertices.includes(masAlNorte))) ?? [];
  return { exterior, interiores: ciclos.filter((c) => c !== exterior) };
}

/**
 * Las aristas del borde exterior del tablero (las que tocan una sola casilla), en orden alrededor
 * del perímetro: cada una comparte un vértice con la siguiente y la última cierra con la primera.
 * Las orillas de los lagos no cuentan: ahí no hay puertos.
 */
export function aristasCosteras(mapa: Mapa): readonly Arista[] {
  return costasDelMapa(mapa).exterior;
}
