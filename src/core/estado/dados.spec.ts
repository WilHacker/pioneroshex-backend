import { describe, expect, it } from 'vitest';
import { tirarDados } from './dados.js';

const serie = (semilla: string): string[] =>
  Array.from({ length: 30 }, (_, i) => tirarDados(semilla, i).join());

describe('tirarDados', () => {
  it('devuelve dos dados entre 1 y 6', () => {
    for (let i = 0; i < 200; i++) {
      const [a, b] = tirarDados('S', i);
      expect(a).toBeGreaterThanOrEqual(1);
      expect(a).toBeLessThanOrEqual(6);
      expect(b).toBeGreaterThanOrEqual(1);
      expect(b).toBeLessThanOrEqual(6);
    }
  });

  it('es determinista para la misma semilla e índice', () => {
    expect(tirarDados('S', 3)).toEqual(tirarDados('S', 3));
  });

  it('cambia con la semilla y con el índice', () => {
    expect(serie('T')).not.toEqual(serie('S'));
    expect(new Set(serie('S')).size).toBeGreaterThan(5);
  });

  it('en 6000 tiradas salen todas las sumas 2..12 y el 7 ronda el 16,7 %', () => {
    const sumas = Array.from({ length: 6000 }, (_, i) => {
      const [a, b] = tirarDados('PRUEBA', i);
      return a + b;
    });
    for (let s = 2; s <= 12; s++) expect(sumas).toContain(s);
    const frecuenciaSiete = sumas.filter((s) => s === 7).length / sumas.length;
    expect(frecuenciaSiete).toBeGreaterThan(0.14);
    expect(frecuenciaSiete).toBeLessThan(0.19);
  });
});
