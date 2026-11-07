import { casillasPorRadio, hex } from './coordenadas.js';
import { crearMapa, crearMapaDesdeCasillas } from './mapa.js';

describe('crearMapaDesdeCasillas', () => {
  it.each([0, 1, 2, 3, 4])('con las casillas del radio %i da el mismo mapa que crearMapa', (R) => {
    expect(crearMapaDesdeCasillas(casillasPorRadio(R))).toEqual(crearMapa(R));
  });

  it('dos casillas vecinas comparten una arista: 10 vértices y 11 aristas', () => {
    const mapa = crearMapaDesdeCasillas([hex(0, 0), hex(1, 0)]);
    expect(mapa.casillas).toHaveLength(2);
    expect(mapa.vertices).toHaveLength(10);
    expect(mapa.aristas).toHaveLength(11);
  });

  it('una forma irregular cumple Euler y no repite identificadores', () => {
    // Una "L" de 5 casillas.
    const mapa = crearMapaDesdeCasillas([hex(0, 0), hex(1, 0), hex(2, 0), hex(0, 1), hex(0, 2)]);
    expect(mapa.vertices.length - mapa.aristas.length + mapa.casillas.length).toBe(1);
    expect(new Set(mapa.vertices.map((v) => v.id)).size).toBe(mapa.vertices.length);
    expect(new Set(mapa.aristas.map((a) => a.id)).size).toBe(mapa.aristas.length);
  });

  it('un mapa con un lago (hueco) cumple V - E + F = 0', () => {
    // Anillo de 6 casillas alrededor del centro, sin el centro: un hueco.
    const anillo = casillasPorRadio(1).filter((c) => c.q !== 0 || c.r !== 0);
    const mapa = crearMapaDesdeCasillas(anillo);
    expect(mapa.casillas).toHaveLength(6);
    expect(mapa.vertices.length - mapa.aristas.length + mapa.casillas.length).toBe(0);
  });

  it('el radio es la mayor distancia de una casilla al centro', () => {
    expect(crearMapaDesdeCasillas([hex(0, 0), hex(1, 0), hex(2, 0)]).radio).toBe(2);
    expect(crearMapaDesdeCasillas([hex(3, -3)]).radio).toBe(3);
  });

  it('es determinista: el mismo orden de casillas da el mismo mapa', () => {
    const casillas = casillasPorRadio(2);
    expect(crearMapaDesdeCasillas(casillas)).toEqual(crearMapaDesdeCasillas(casillas));
  });

  it('no muta la lista recibida', () => {
    const casillas = [hex(0, 0), hex(1, 0)];
    const copia = structuredClone(casillas);
    crearMapaDesdeCasillas(casillas);
    expect(casillas).toEqual(copia);
  });

  it('rechaza una lista vacía', () => {
    expect(() => crearMapaDesdeCasillas([])).toThrow(/al menos una casilla/);
  });

  it('rechaza casillas repetidas', () => {
    expect(() => crearMapaDesdeCasillas([hex(0, 0), hex(1, 0), hex(0, 0)])).toThrow(/repetid/);
  });

  it('rechaza una casilla que rompe q + r + s = 0', () => {
    const rota = { q: 1, r: 1, s: 1 };
    expect(() => crearMapaDesdeCasillas([hex(0, 0), rota])).toThrow(/q \+ r \+ s/);
  });
});
