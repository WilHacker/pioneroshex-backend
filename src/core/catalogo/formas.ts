import { DIRECCIONES, type Hex, clave, hex, sumar } from '../mapa/coordenadas.js';

/** Casilla como par `[q, r]`: la forma compacta que guarda `GameConfig.mapa`. */
export type Par = readonly [number, number];

/** Pasa casillas a pares `[q, r]`. */
export const aPares = (casillas: readonly Hex[]): readonly Par[] =>
  casillas.map((c): Par => [c.q, c.r]);

/** Mueve la forma para que su centro quede en el origen (el desplazamiento es entero). */
function centrar(casillas: readonly Hex[]): readonly Hex[] {
  const q = Math.round(casillas.reduce((suma, c) => suma + c.q, 0) / casillas.length);
  const r = Math.round(casillas.reduce((suma, c) => suma + c.r, 0) / casillas.length);
  return casillas.map((c) => hex(c.q - q, c.r - r));
}

/**
 * Lee un mapa dibujado con texto: una fila por línea, `#` es tierra y `.` es agua, separados por
 * espacios. Las filas impares van media casilla a la derecha (hexágonos con la punta arriba);
 * conviene sangrarlas un espacio para ver la forma. El resultado queda centrado en el origen.
 */
export function desdeDibujo(filas: readonly string[]): readonly Hex[] {
  const casillas: Hex[] = [];
  filas.forEach((fila, r) => {
    fila
      .split(/\s+/)
      .filter((celda) => celda !== '')
      .forEach((celda, columna) => {
        if (celda !== '#' && celda !== '.') {
          throw new Error(`Símbolo no válido en el dibujo: «${celda}» (solo # y .)`);
        }
        // Desplazamiento "odd-r" → coordenadas axiales.
        if (celda === '#') casillas.push(hex(columna - (r - (r % 2)) / 2, r));
      });
  });
  if (casillas.length === 0) throw new Error('El dibujo está sin tierra');
  return centrar(casillas);
}

/** Paralelogramo de `lado` × `lado` casillas (con la punta arriba se ve como un rombo). */
export function rombo(lado: number): readonly Hex[] {
  const casillas: Hex[] = [];
  for (let q = 0; q < lado; q++) for (let r = 0; r < lado; r++) casillas.push(hex(q, r));
  return centrar(casillas);
}

/** Las casillas a distancia `radio` del centro, en orden: cada una es vecina de la siguiente. */
export function anillo(radio: number): readonly Hex[] {
  if (radio === 0) return [hex(0, 0)];
  const casillas: Hex[] = [];
  let actual = hex(DIRECCIONES[4]!.q * radio, DIRECCIONES[4]!.r * radio);
  for (const direccion of DIRECCIONES) {
    for (let paso = 0; paso < radio; paso++) {
      casillas.push(actual);
      actual = sumar(actual, direccion);
    }
  }
  return casillas;
}

/** La lista sin las casillas indicadas. No muta la original. */
export function sinCasillas(base: readonly Hex[], quitar: readonly Hex[]): readonly Hex[] {
  const fuera = new Set(quitar.map(clave));
  return base.filter((c) => !fuera.has(clave(c)));
}
