import { casillasPorRadio, clave, distancia, hex } from '../mapa/coordenadas.js';
import { anillo, aPares, desdeDibujo, rombo, sinCasillas } from './formas.js';

describe('desdeDibujo', () => {
  it('cada # es una casilla y cada . es agua', () => {
    expect(desdeDibujo(['# # .', ' . # #'])).toHaveLength(4);
  });

  it('las filas impares van desplazadas media casilla a la derecha', () => {
    // La casilla de abajo (fila 1, col 0) queda entre las dos de arriba: es vecina de ambas.
    const [a, b, abajo] = desdeDibujo(['# #', ' #']);
    expect(distancia(a!, abajo!)).toBe(1);
    expect(distancia(b!, abajo!)).toBe(1);
    expect(distancia(a!, b!)).toBe(1);
  });

  it('una hilera es una línea de casillas vecinas', () => {
    const casillas = desdeDibujo(['# # # #']);
    casillas.slice(1).forEach((c, i) => expect(distancia(casillas[i]!, c)).toBe(1));
  });

  it('centra la forma cerca del origen', () => {
    const casillas = desdeDibujo(['# # # # # #', ' # # # # # #', '# # # # # #', ' # # # # # #']);
    const q = casillas.reduce((s, c) => s + c.q, 0) / casillas.length;
    const r = casillas.reduce((s, c) => s + c.r, 0) / casillas.length;
    expect(Math.abs(q)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(r)).toBeLessThanOrEqual(0.5);
  });

  it('no repite casillas y respeta q + r + s = 0', () => {
    const casillas = desdeDibujo(['# # #', ' # # #', '# # #']);
    expect(new Set(casillas.map(clave)).size).toBe(casillas.length);
    expect(casillas.every((c) => c.q + c.r + c.s === 0)).toBe(true);
  });

  it('rechaza símbolos que no son # ni .', () => {
    expect(() => desdeDibujo(['# X #'])).toThrow(/símbolo/i);
  });

  it('rechaza un dibujo sin tierra', () => {
    expect(() => desdeDibujo(['. . .', ' . .'])).toThrow(/sin tierra/);
  });
});

describe('formas geométricas', () => {
  it('rombo(n) tiene n × n casillas', () => {
    expect(rombo(5)).toHaveLength(25);
    expect(rombo(1)).toHaveLength(1);
  });

  it('anillo(k) tiene 6k casillas, todas a distancia k, en orden (cada una vecina de la siguiente)', () => {
    const a = anillo(3);
    expect(a).toHaveLength(18);
    expect(a.every((c) => distancia(c, hex(0, 0)) === 3)).toBe(true);
    a.forEach((c, i) => expect(distancia(c, a[(i + 1) % a.length]!)).toBe(1));
  });

  it('anillo(0) es el centro', () => {
    expect(anillo(0)).toEqual([hex(0, 0)]);
  });

  it('sinCasillas quita las pedidas y no muta la lista', () => {
    const base = casillasPorRadio(1);
    const resultado = sinCasillas(base, [hex(0, 0)]);
    expect(resultado).toHaveLength(6);
    expect(base).toHaveLength(7);
  });

  it('aPares da [q, r]', () => {
    expect(aPares([hex(2, -1)])).toEqual([[2, -1]]);
  });
});
