import { DIRECCIONES, casillasPorRadio, clave, distancia, hex, vecinos } from './coordenadas.js';

describe('coordenadas cúbicas', () => {
  it('deriva s para que q + r + s sea 0', () => {
    const h = hex(2, -3);
    expect(h).toEqual({ q: 2, r: -3, s: 1 });
    expect(h.q + h.r + h.s).toBe(0);
  });

  it('el origen no produce -0', () => {
    expect(Object.is(hex(0, 0).s, 0)).toBe(true);
  });

  it('clave es única por casilla y estable', () => {
    expect(clave(hex(1, -1))).toBe(clave(hex(1, -1)));
    expect(clave(hex(1, -1))).not.toBe(clave(hex(-1, 1)));
  });

  describe('DIRECCIONES', () => {
    it('son 6, suman 0 y no se repiten', () => {
      expect(DIRECCIONES).toHaveLength(6);
      for (const d of DIRECCIONES) expect(d.q + d.r + d.s).toBe(0);
      expect(new Set(DIRECCIONES.map(clave)).size).toBe(6);
    });

    it('están en orden cíclico: cada dirección es vecina de la siguiente', () => {
      DIRECCIONES.forEach((d, i) => {
        const siguiente = DIRECCIONES[(i + 1) % 6];
        const diferencia = hex(siguiente.q - d.q, siguiente.r - d.r);
        expect(distancia(diferencia, hex(0, 0))).toBe(1);
      });
    });
  });

  describe('vecinos', () => {
    it('devuelve 6 casillas distintas a distancia 1', () => {
      const origen = hex(0, 0);
      const resultado = vecinos(origen);
      expect(resultado).toHaveLength(6);
      expect(new Set(resultado.map(clave)).size).toBe(6);
      for (const v of resultado) expect(distancia(origen, v)).toBe(1);
    });

    it('no muta la casilla recibida', () => {
      const origen = hex(1, 1);
      vecinos(origen);
      expect(origen).toEqual({ q: 1, r: 1, s: -2 });
    });
  });

  describe('distancia', () => {
    it('es 0 a sí misma y simétrica', () => {
      const a = hex(2, -1);
      const b = hex(-1, 3);
      expect(distancia(a, a)).toBe(0);
      expect(distancia(a, b)).toBe(distancia(b, a));
    });

    it('cuenta los pasos entre casillas', () => {
      expect(distancia(hex(0, 0), hex(2, -1))).toBe(2);
      expect(distancia(hex(-2, 0), hex(2, 0))).toBe(4);
    });
  });

  describe('casillasPorRadio', () => {
    it.each([0, 1, 2, 3, 4, 5])(
      'radio %i tiene 3R(R+1)+1 casillas únicas dentro del radio',
      (R) => {
        const casillas = casillasPorRadio(R);
        expect(casillas).toHaveLength(3 * R * (R + 1) + 1);
        expect(new Set(casillas.map(clave)).size).toBe(casillas.length);
        for (const c of casillas) expect(distancia(hex(0, 0), c)).toBeLessThanOrEqual(R);
      },
    );

    it('incluye el centro', () => {
      expect(casillasPorRadio(2).map(clave)).toContain(clave(hex(0, 0)));
    });
  });
});
