import type { Hex } from '../mapa/coordenadas.js';
import { centroDeCasilla, posicionDeVertice, type Punto } from '../mapa/geometria.js';
import type { TipoPuerto } from '../reglas/puertos.js';
import type { Terreno } from '../reglas/tablero.js';
import type { Mesa } from './mesa.js';

/**
 * La parte fija de la partida lista para dibujar: casillas con su terreno y su ficha, vértices,
 * aristas y puertos, con sus posiciones (lado 1, pointy-top, y hacia abajo). Se manda una sola vez
 * al entrar: no cambia con las jugadas. El cliente no tiene el código que genera el tablero, así
 * que lo recibe ya hecho. Es JSON puro y no contiene ninguna semilla.
 */
export interface MesaPublica {
  readonly radio: number;
  readonly casillas: readonly {
    readonly hex: Hex;
    readonly terreno: Terreno;
    /** `null` en el desierto. */
    readonly ficha: number | null;
    readonly centro: Punto;
  }[];
  readonly vertices: readonly {
    readonly id: string;
    readonly posicion: Punto;
    readonly vecinos: readonly string[];
  }[];
  readonly aristas: readonly {
    readonly id: string;
    readonly vertices: readonly [string, string];
  }[];
  readonly puertos: readonly {
    readonly arista: string;
    readonly vertices: readonly [string, string];
    readonly tipo: TipoPuerto;
  }[];
}

/** Copia nueva cada vez: quien la reciba puede modificarla sin tocar la mesa. */
export function mesaPublica(mesa: Mesa): MesaPublica {
  return {
    radio: mesa.mapa.radio,
    casillas: mesa.tablero.casillas.map((c) => ({
      hex: { q: c.hex.q, r: c.hex.r, s: c.hex.s },
      terreno: c.terreno,
      ficha: c.ficha,
      centro: centroDeCasilla(c.hex),
    })),
    vertices: mesa.mapa.vertices.map((v) => ({
      id: v.id,
      posicion: posicionDeVertice(v.id),
      vecinos: [...v.vecinos],
    })),
    aristas: mesa.mapa.aristas.map((a) => ({ id: a.id, vertices: [a.vertices[0], a.vertices[1]] })),
    puertos: mesa.puertos.map((p) => ({
      arista: p.arista,
      vertices: [p.vertices[0], p.vertices[1]],
      tipo: p.tipo,
    })),
  };
}
