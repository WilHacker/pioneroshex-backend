import { hex, type Hex } from './coordenadas.js';

/** Punto del plano con x hacia la derecha e y hacia abajo (como en pantalla). */
export interface Punto {
  readonly x: number;
  readonly y: number;
}

const RAIZ_DE_3 = Math.sqrt(3);
/** Casillas por vértice: el id de un vértice es el trío de claves de las casillas que lo comparten. */
const CASILLAS_POR_VERTICE = 3;

/** Inversa de `clave` (`"q,r"`). Lanza si el texto no es una clave de casilla. */
export function hexDeClave(texto: string): Hex {
  const partes = texto.split(',');
  const [q, r] = partes.map(Number);
  if (partes.length !== 2 || !Number.isInteger(q) || !Number.isInteger(r)) {
    throw new Error(`La clave de casilla no es válida: "${texto}"`);
  }
  return hex(q!, r!);
}

/** Centro de una casilla pointy-top de lado 1. Es una convención de dibujo, no una regla del juego. */
export function centroDeCasilla(h: Hex): Punto {
  return { x: RAIZ_DE_3 * (h.q + h.r / 2), y: 1.5 * h.r };
}

/**
 * Posición de un vértice: el centro de las tres casillas que lo comparten. Sirve también en el
 * borde, donde alguna de las tres cae fuera del tablero (el id las incluye todas).
 */
export function posicionDeVertice(id: string): Punto {
  const claves = id.split('|');
  if (claves.length !== CASILLAS_POR_VERTICE) {
    throw new Error(`El id de vértice no es válido: "${id}"`);
  }
  const centros = claves.map((c) => centroDeCasilla(hexDeClave(c)));
  return {
    x: centros.reduce((suma, p) => suma + p.x, 0) / CASILLAS_POR_VERTICE,
    y: centros.reduce((suma, p) => suma + p.y, 0) / CASILLAS_POR_VERTICE,
  };
}

export function distanciaEntre(a: Punto, b: Punto): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
