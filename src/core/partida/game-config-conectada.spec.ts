import { casillasPorRadio } from '../mapa/coordenadas.js';
import { crearGameConfig } from './game-config.js';

const BASE = { semillaMapa: 'MAPA-PRUEBA', semillaAzar: '#secreta-de-prueba', jugadores: 2 };
const pares = (casillas: readonly { q: number; r: number }[]): [number, number][] =>
  casillas.map((c) => [c.q, c.r]);

describe('crearGameConfig exige tierra conectada', () => {
  it('rechaza un mapa partido en dos trozos (un camino no cruza el agua)', () => {
    const dosIslas = [
      ...pares(casillasPorRadio(1)),
      ...pares(casillasPorRadio(1)).map(([q, r]): [number, number] => [q + 5, r]),
    ];
    expect(() =>
      crearGameConfig({ ...BASE, mapa: { nombre: 'Islas', casillas: dosIslas } }),
    ).toThrow(/conectada/);
  });

  it('acepta un mapa con un lago', () => {
    const conLago = pares(casillasPorRadio(2).filter((c) => c.q !== 0 || c.r !== 0));
    expect(() =>
      crearGameConfig({ ...BASE, mapa: { nombre: 'Lago', casillas: conLago } }),
    ).not.toThrow();
  });
});
