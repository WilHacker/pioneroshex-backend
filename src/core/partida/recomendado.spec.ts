import { describe, expect, it } from 'vitest';
import { JUGADORES_MAX, JUGADORES_MIN } from './game-config.js';
import { recomendadoPara } from './recomendado.js';

const rango = Array.from(
  { length: JUGADORES_MAX - JUGADORES_MIN + 1 },
  (_, i) => JUGADORES_MIN + i,
);

describe('recomendadoPara', () => {
  it('con 2 a 4 jugadores es el juego clásico: 10 puntos y turnos A', () => {
    for (const n of [2, 3, 4]) {
      expect(recomendadoPara(n)).toMatchObject({
        puntosVictoria: 10,
        robberHandLimit: 7,
        turnRuleMode: 'A',
      });
    }
  });

  it('con 12 jugadores pide una partida más larga (al menos 15 puntos) y turnos cortos', () => {
    const doce = recomendadoPara(12);
    expect(doce.puntosVictoria).toBeGreaterThanOrEqual(15);
    expect(doce.turnoSegundos).toBeGreaterThan(0);
    expect(doce.turnoSegundos).toBeLessThan(recomendadoPara(4).turnoSegundos);
  });

  it('el modo B (construcción especial) solo se recomienda desde 5 jugadores', () => {
    for (const n of rango) {
      if (n < 5) expect(recomendadoPara(n).turnRuleMode).toBe('A');
      else expect(recomendadoPara(n).turnRuleMode).toBe('B');
    }
  });

  it('con más jugadores nunca baja los puntos ni sube el tiempo por turno', () => {
    for (const n of rango.slice(1)) {
      const antes = recomendadoPara(n - 1);
      const ahora = recomendadoPara(n);
      expect(ahora.puntosVictoria).toBeGreaterThanOrEqual(antes.puntosVictoria);
      expect(ahora.turnoSegundos).toBeLessThanOrEqual(antes.turnoSegundos);
    }
  });

  it('rechaza un número de jugadores imposible', () => {
    for (const n of [0, 1, 13, 2.5, Number.NaN, -3]) {
      expect(() => recomendadoPara(n)).toThrow(RangeError);
    }
  });

  it('devuelve un objeto nuevo cada vez', () => {
    expect(recomendadoPara(6)).not.toBe(recomendadoPara(6));
    expect(recomendadoPara(6)).toEqual(recomendadoPara(6));
  });
});
