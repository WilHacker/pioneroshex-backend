import fc from 'fast-check';
import { casillasPorRadio, clave, hex } from './coordenadas.js';
import { crearMapa, verticesDeCasilla } from './mapa.js';

const RADIOS = [0, 1, 2, 3, 4, 5];

describe('crearMapa', () => {
  it('el tablero clásico (R=2) tiene 19 casillas, 54 vértices y 72 aristas', () => {
    const mapa = crearMapa(2);
    expect(mapa.casillas).toHaveLength(19);
    expect(mapa.vertices).toHaveLength(54);
    expect(mapa.aristas).toHaveLength(72);
  });

  it.each(RADIOS)('radio %i cumple las fórmulas de casillas, vértices y aristas', (R) => {
    const mapa = crearMapa(R);
    expect(mapa.casillas).toHaveLength(3 * R * (R + 1) + 1);
    expect(mapa.vertices).toHaveLength(6 * (R + 1) ** 2);
    expect(mapa.aristas).toHaveLength(9 * R ** 2 + 15 * R + 6);
  });

  it.each(RADIOS)('radio %i cumple la relación de Euler V - E + F = 1', (R) => {
    const mapa = crearMapa(R);
    expect(mapa.vertices.length - mapa.aristas.length + mapa.casillas.length).toBe(1);
  });

  it.each(RADIOS)('radio %i no repite identificadores', (R) => {
    const mapa = crearMapa(R);
    expect(new Set(mapa.vertices.map((v) => v.id)).size).toBe(mapa.vertices.length);
    expect(new Set(mapa.aristas.map((a) => a.id)).size).toBe(mapa.aristas.length);
  });

  it.each(RADIOS)('radio %i: vértices interiores 6R² y costeros 12R+6', (R) => {
    const mapa = crearMapa(R);
    const interiores = mapa.vertices.filter((v) => v.casillas.length === 3);
    expect(interiores).toHaveLength(6 * R ** 2);
    expect(mapa.vertices.length - interiores.length).toBe(12 * R + 6);
  });

  it('cada vértice toca entre 1 y 3 casillas y tiene 2 o 3 vecinos', () => {
    for (const v of crearMapa(3).vertices) {
      expect(v.casillas.length).toBeGreaterThanOrEqual(1);
      expect(v.casillas.length).toBeLessThanOrEqual(3);
      expect([2, 3]).toContain(v.vecinos.length);
    }
  });

  it('cada casilla aparece exactamente en 6 vértices', () => {
    const mapa = crearMapa(2);
    const total = mapa.vertices.reduce((suma, v) => suma + v.casillas.length, 0);
    expect(total).toBe(6 * mapa.casillas.length);
  });

  it('las aristas unen vértices que existen y la relación de vecindad es simétrica', () => {
    const mapa = crearMapa(2);
    const porId = new Map(mapa.vertices.map((v) => [v.id, v]));
    for (const arista of mapa.aristas) {
      const [a, b] = arista.vertices;
      expect(a).not.toBe(b);
      expect(porId.get(a)?.vecinos).toContain(b);
      expect(porId.get(b)?.vecinos).toContain(a);
    }
  });

  it('es determinista', () => {
    expect(crearMapa(2)).toEqual(crearMapa(2));
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rechaza el radio inválido %s', (R) => {
    expect(() => crearMapa(R)).toThrow(/radio/i);
  });
});

describe('crearMapa (propiedades)', () => {
  it('para cualquier radio válido se cumplen las fórmulas y Euler', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 12 }), (R) => {
        const mapa = crearMapa(R);
        return (
          mapa.casillas.length === 3 * R * (R + 1) + 1 &&
          mapa.vertices.length === 6 * (R + 1) ** 2 &&
          mapa.aristas.length === 9 * R ** 2 + 15 * R + 6 &&
          mapa.vertices.length - mapa.aristas.length + mapa.casillas.length === 1
        );
      }),
    );
  });

  it('cada arista conecta dos vértices que comparten al menos una casilla o la costa', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 8 }), (R) => {
        const mapa = crearMapa(R);
        const porId = new Map(mapa.vertices.map((v) => [v.id, v]));
        return mapa.aristas.every((arista) => {
          const [a, b] = arista.vertices.map((id) => porId.get(id));
          return a !== undefined && b !== undefined && a.vecinos.includes(b.id);
        });
      }),
    );
  });
});

describe('verticesDeCasilla', () => {
  it('devuelve 6 vértices distintos', () => {
    expect(new Set(verticesDeCasilla(hex(0, 0))).size).toBe(6);
  });

  it('están en orden cíclico: cada par consecutivo (y el último con el primero) forma una arista', () => {
    const mapa = crearMapa(2);
    const aristas = new Set(mapa.aristas.map((a) => a.vertices.toSorted().join('~')));
    for (const casilla of mapa.casillas) {
      const ids = verticesDeCasilla(casilla);
      ids.forEach((id, i) => {
        const siguiente = ids[(i + 1) % 6];
        expect(aristas.has([id, siguiente].toSorted().join('~'))).toBe(true);
      });
    }
  });

  it('coincide con los vértices del mapa: dos casillas vecinas comparten exactamente 2', () => {
    const a = new Set(verticesDeCasilla(hex(0, 0)));
    const compartidos = verticesDeCasilla(hex(1, 0)).filter((id) => a.has(id));
    expect(compartidos).toHaveLength(2);
  });

  it('todos los vértices de una casilla del tablero existen en el mapa', () => {
    const mapa = crearMapa(2);
    const ids = new Set(mapa.vertices.map((v) => v.id));
    for (const c of casillasPorRadio(2)) {
      for (const id of verticesDeCasilla(c)) expect(ids.has(id)).toBe(true);
    }
  });

  it('el centro del tablero R=2 tiene 6 vértices interiores', () => {
    const mapa = crearMapa(2);
    const porId = new Map(mapa.vertices.map((v) => [v.id, v]));
    for (const id of verticesDeCasilla(hex(0, 0))) {
      expect(porId.get(id)?.casillas.map(clave)).toContain(clave(hex(0, 0)));
      expect(porId.get(id)?.casillas).toHaveLength(3);
    }
  });
});
