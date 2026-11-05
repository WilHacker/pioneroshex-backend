import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DIRECCIONES, clave, hex, sumar } from './coordenadas.js';
import { centroDeCasilla, hexDeClave, posicionDeVertice, distanciaEntre } from './geometria.js';
import { crearMapa, verticesDeCasilla } from './mapa.js';

const RAIZ3 = Math.sqrt(3);

describe('hexDeClave', () => {
  it('es la inversa de clave', () => {
    fc.assert(
      fc.property(fc.integer({ min: -9, max: 9 }), fc.integer({ min: -9, max: 9 }), (q, r) => {
        expect(hexDeClave(clave(hex(q, r)))).toEqual(hex(q, r));
      }),
    );
  });

  it.each(['', 'a,b', '1', '1,2,3', '1.5,2', 'NaN,0'])('rechaza la clave inválida %j', (texto) => {
    expect(() => hexDeClave(texto)).toThrow(/clave/);
  });
});

describe('centroDeCasilla (pointy-top, lado 1, y crece hacia abajo)', () => {
  it('el centro del tablero es el origen', () => {
    expect(centroDeCasilla(hex(0, 0))).toEqual({ x: 0, y: 0 });
  });

  it('este, abajo-derecha y arriba-derecha caen donde toca', () => {
    expect(centroDeCasilla(hex(1, 0))).toEqual({ x: RAIZ3, y: 0 });
    expect(centroDeCasilla(hex(0, 1))).toEqual({ x: RAIZ3 / 2, y: 1.5 });
    expect(centroDeCasilla(hex(1, -1))).toEqual({ x: RAIZ3 / 2, y: -1.5 });
  });

  it('las seis vecinas están a la misma distancia, √3', () => {
    for (const d of DIRECCIONES) {
      expect(
        distanciaEntre(centroDeCasilla(hex(0, 0)), centroDeCasilla(sumar(hex(0, 0), d))),
      ).toBeCloseTo(RAIZ3, 10);
    }
  });
});

describe('posicionDeVertice', () => {
  it('las seis esquinas de una casilla están a distancia 1 de su centro', () => {
    fc.assert(
      fc.property(fc.integer({ min: -5, max: 5 }), fc.integer({ min: -5, max: 5 }), (q, r) => {
        const casilla = hex(q, r);
        for (const id of verticesDeCasilla(casilla)) {
          expect(distanciaEntre(posicionDeVertice(id), centroDeCasilla(casilla))).toBeCloseTo(
            1,
            10,
          );
        }
      }),
    );
  });

  it('los vértices unidos por una arista están a distancia 1 (también en el borde del tablero)', () => {
    const mapa = crearMapa(2);
    for (const arista of mapa.aristas) {
      const [a, b] = arista.vertices;
      expect(distanciaEntre(posicionDeVertice(a), posicionDeVertice(b))).toBeCloseTo(1, 10);
    }
  });

  it('no hay dos vértices en el mismo punto', () => {
    const mapa = crearMapa(3);
    const puntos = new Set(
      mapa.vertices.map((v) => {
        const p = posicionDeVertice(v.id);
        return `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
      }),
    );
    expect(puntos.size).toBe(mapa.vertices.length);
  });

  it('rechaza un id que no es un trío de claves', () => {
    expect(() => posicionDeVertice('0,0|1,0')).toThrow(/vértice/);
  });
});
