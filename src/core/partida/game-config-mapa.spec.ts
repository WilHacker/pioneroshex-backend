import { casillasPorRadio } from '../mapa/coordenadas.js';
import { crearGameConfig, type MapaConfig } from './game-config.js';

const BASE = { semillaMapa: 'MAPA-PRUEBA', semillaAzar: '#secreta-de-prueba' };

const comoPares = (radio: number): MapaConfig['casillas'] =>
  casillasPorRadio(radio).map((c) => [c.q, c.r] as const);

describe('crearGameConfig con mapa propio', () => {
  it('sin mapa, la config no lleva el campo (partidas viejas y el clásico no cambian)', () => {
    const config = crearGameConfig(BASE);
    expect(config.mapa).toBeUndefined();
    expect(config.radio).toBe(2);
  });

  it('con mapa, guarda una copia y fija el radio al del mapa', () => {
    const mapa: MapaConfig = { nombre: 'Radio 3', casillas: comoPares(3) };
    const config = crearGameConfig({ ...BASE, jugadores: 6, mapa });
    expect(config.mapa?.nombre).toBe('Radio 3');
    expect(config.mapa?.casillas).toHaveLength(37);
    expect(config.radio).toBe(3);
  });

  it('no comparte referencias con la entrada ni se puede mutar', () => {
    const casillas = casillasPorRadio(2).map((c): [number, number] => [c.q, c.r]);
    const config = crearGameConfig({ ...BASE, mapa: { nombre: 'Copia', casillas } });
    expect(config.mapa?.casillas).not.toBe(casillas);
    casillas[0]![0] = 99;
    expect(config.mapa?.casillas[0]?.[0]).not.toBe(99);
    expect(Object.isFrozen(config.mapa)).toBe(true);
  });

  it('rechaza un mapa que no alcanza para los jugadores (2 casillas, 4 jugadores)', () => {
    const mapa: MapaConfig = {
      nombre: 'Pequeño',
      casillas: [
        [0, 0],
        [1, 0],
      ],
    };
    expect(() => crearGameConfig({ ...BASE, jugadores: 4, mapa })).toThrow(/muy pequeño/);
  });

  it('el mismo mapa sirve para menos jugadores y no para más', () => {
    // Radio 1: 24 vértices > 4·(2n−1) solo para n = 3 (20).
    const mapa: MapaConfig = { nombre: 'Radio 1', casillas: comoPares(1) };
    expect(() => crearGameConfig({ ...BASE, jugadores: 3, mapa })).not.toThrow();
    expect(() => crearGameConfig({ ...BASE, jugadores: 4, mapa })).toThrow(/muy pequeño/);
  });

  it.each([
    ['vacío', { nombre: 'Vacío', casillas: [] }, /al menos una casilla/],
    [
      'repetido',
      {
        nombre: 'Repetido',
        casillas: [
          [0, 0],
          [0, 0],
        ],
      },
      /repetid/,
    ],
    ['con decimales', { nombre: 'Decimal', casillas: [[0.5, 0]] }, /q \+ r \+ s/],
  ] as const)('rechaza un mapa %s', (_caso, mapa, mensaje) => {
    expect(() =>
      crearGameConfig({ ...BASE, jugadores: 2, mapa: mapa as unknown as MapaConfig }),
    ).toThrow(mensaje);
  });

  it('rechaza un mapa sin nombre', () => {
    const mapa: MapaConfig = { nombre: '  ', casillas: comoPares(2) };
    expect(() => crearGameConfig({ ...BASE, mapa })).toThrow(/nombre/);
  });
});
