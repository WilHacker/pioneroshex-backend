import { casillasPorRadio } from '../mapa/coordenadas.js';
import { costasDelMapa, crearMapaDesdeCasillas } from '../mapa/mapa.js';
import { generarPuertos, tiposDePuertosParaCosta } from './puertos.js';

const RADIO3_UN_LAGO = casillasPorRadio(3).filter(
  (c) => Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.s)) > 1,
);
const mapa = crearMapaDesdeCasillas(RADIO3_UN_LAGO);
const { exterior, interiores } = costasDelMapa(mapa);

describe('generarPuertos en un mapa con lago', () => {
  const puertos = generarPuertos(mapa, 'LAGO-1');

  it('reparte según la costa exterior', () => {
    expect(puertos).toHaveLength(tiposDePuertosParaCosta(exterior.length).length);
  });

  it('todos los puertos están en la costa exterior', () => {
    const ids = new Set(exterior.map((a) => a.id));
    expect(puertos.every((p) => ids.has(p.arista))).toBe(true);
  });

  it('ningún puerto toca la orilla de un lago', () => {
    const verticesDelLago = new Set(interiores.flat().flatMap((a) => a.vertices));
    expect(puertos.some((p) => p.vertices.some((v) => verticesDelLago.has(v)))).toBe(false);
  });

  it('ningún vértice queda en dos puertos', () => {
    const vertices = puertos.flatMap((p) => p.vertices);
    expect(new Set(vertices).size).toBe(vertices.length);
  });

  it('es determinista', () => {
    expect(generarPuertos(mapa, 'LAGO-1')).toEqual(puertos);
  });
});
