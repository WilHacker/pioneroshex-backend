import { crearGameConfig, JUGADORES_MAX, JUGADORES_MIN } from '../partida/game-config.js';
import { casillasPorRadio } from '../mapa/coordenadas.js';
import {
  aptitudParaJugadores,
  maximoPorVertices,
  maximoRecomendado,
  maximoTecnico,
} from './jugadores.js';

const verticesDelHexagono = (radio: number) => 6 * (radio + 1) ** 2;

describe('maximoPorVertices (el límite de seguridad de crearGameConfig)', () => {
  it('coincide con las notas: radio 2 hasta 7 jugadores, radio 3 hasta 12', () => {
    expect(maximoPorVertices(verticesDelHexagono(2))).toBe(7);
    expect(maximoPorVertices(verticesDelHexagono(3))).toBe(12);
  });

  it.each([1, 2, 3, 4])(
    'en el hexágono de radio %i, n es válido para crearGameConfig y n + 1 no',
    (radio) => {
      const limite = maximoPorVertices(verticesDelHexagono(radio));
      const mapa = {
        nombre: `R${radio}`,
        casillas: casillasPorRadio(radio).map((c): [number, number] => [c.q, c.r]),
      };
      const base = { semillaMapa: 'M', semillaAzar: '#a', mapa };
      if (limite <= JUGADORES_MAX) {
        expect(() => crearGameConfig({ ...base, jugadores: limite })).not.toThrow();
      }
      if (limite + 1 <= JUGADORES_MAX) {
        expect(() => crearGameConfig({ ...base, jugadores: limite + 1 })).toThrow(/muy pequeño/);
      }
    },
  );
});

describe('máximos de un mapa', () => {
  it('el técnico nunca pasa del tope del juego ni baja del mínimo', () => {
    expect(maximoTecnico(verticesDelHexagono(10))).toBe(JUGADORES_MAX);
    expect(maximoTecnico(6)).toBe(JUGADORES_MIN);
  });

  it('el recomendado es unos 12 vértices por jugador y nunca pasa del técnico', () => {
    expect(maximoRecomendado(verticesDelHexagono(2))).toBe(4);
    expect(maximoRecomendado(verticesDelHexagono(3))).toBe(8);
    for (const v of [24, 54, 96, 150, 400]) {
      expect(maximoRecomendado(v)).toBeLessThanOrEqual(maximoTecnico(v));
    }
  });
});

describe('aptitudParaJugadores', () => {
  const V = verticesDelHexagono(3); // técnico 12 (o el tope), recomendado 8, mínimo recomendado 4

  it('RECOMENDADO dentro del rango cómodo', () => {
    expect(aptitudParaJugadores(V, 4)).toBe('RECOMENDADO');
    expect(aptitudParaJugadores(V, 8)).toBe('RECOMENDADO');
  });

  it('JUSTO si sobra espacio (pocos jugadores) o se apretuja (más del recomendado)', () => {
    expect(aptitudParaJugadores(V, 2)).toBe('JUSTO');
    expect(aptitudParaJugadores(V, 9)).toBe('JUSTO');
  });

  it('NO si no caben los poblados iniciales', () => {
    expect(aptitudParaJugadores(verticesDelHexagono(2), 8)).toBe('NO');
  });

  it('NO para un número de jugadores fuera de rango', () => {
    expect(aptitudParaJugadores(V, 1)).toBe('NO');
    expect(aptitudParaJugadores(V, JUGADORES_MAX + 1)).toBe('NO');
  });
});
