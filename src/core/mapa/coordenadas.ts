/** Casilla en coordenadas cúbicas: `q + r + s = 0`, hexágonos pointy-top. El centro es (0,0,0). */
export interface Hex {
  readonly q: number;
  readonly r: number;
  readonly s: number;
}

/** Crea una casilla derivando `s`. Se escribe `0 - q - r` para no producir `-0` en el origen. */
export function hex(q: number, r: number): Hex {
  return { q, r, s: 0 - q - r };
}

/**
 * Las 6 direcciones vecinas en orden cíclico (E, NE, NO, O, SO, SE): cada una es vecina de la
 * siguiente. De ese orden depende el de los vértices de una casilla.
 */
export const DIRECCIONES: readonly Hex[] = [
  hex(1, 0),
  hex(1, -1),
  hex(0, -1),
  hex(-1, 0),
  hex(-1, 1),
  hex(0, 1),
];

/** Identificador estable de una casilla, apto como clave de Map/Set. */
export function clave(h: Hex): string {
  return `${h.q},${h.r}`;
}

export function sumar(a: Hex, b: Hex): Hex {
  return hex(a.q + b.q, a.r + b.r);
}

export function vecinos(h: Hex): readonly Hex[] {
  return DIRECCIONES.map((d) => sumar(h, d));
}

/** Pasos mínimos entre dos casillas. */
export function distancia(a: Hex, b: Hex): number {
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.s - b.s));
}

/** Todas las casillas a distancia <= `radio` del centro: `3R(R+1)+1`. */
export function casillasPorRadio(radio: number): readonly Hex[] {
  const casillas: Hex[] = [];
  for (let q = -radio; q <= radio; q++) {
    for (let r = Math.max(-radio, -q - radio); r <= Math.min(radio, -q + radio); r++) {
      casillas.push(hex(q, r));
    }
  }
  return casillas;
}
