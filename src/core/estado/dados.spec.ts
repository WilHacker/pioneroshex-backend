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

const bloque = (semilla: string, n: number): string[] =>
  Array.from({ length: 36 }, (_, i) => tirarDados(semilla, n * 36 + i, 'EQUILIBRADO').join());

describe('tirarDados en modo EQUILIBRADO', () => {
  it('en cada bloque de 36 tiradas sale cada combinación exactamente una vez', () => {
    for (let n = 0; n < 5; n++) {
      const combinaciones = bloque('EQ', n);
      expect(new Set(combinaciones).size).toBe(36);
    }
  });

  it('por eso en 36 tiradas el 7 sale exactamente 6 veces', () => {
    const sumas = Array.from({ length: 36 }, (_, i) => {
      const [a, b] = tirarDados('EQ', i, 'EQUILIBRADO');
      return a + b;
    });
    expect(sumas.filter((s) => s === 7)).toHaveLength(6);
    expect(sumas.filter((s) => s === 2)).toHaveLength(1);
    expect(sumas.filter((s) => s === 12)).toHaveLength(1);
  });

  it('es determinista y el orden cambia con la semilla y de un bloque a otro', () => {
    expect(tirarDados('EQ', 9, 'EQUILIBRADO')).toEqual(tirarDados('EQ', 9, 'EQUILIBRADO'));
    expect(bloque('EQ', 0)).not.toEqual(bloque('OTRA', 0));
    expect(bloque('EQ', 0)).not.toEqual(bloque('EQ', 1));
  });

  it('siempre da dados entre 1 y 6', () => {
    for (let i = 0; i < 200; i++) {
      const [a, b] = tirarDados('EQ', i, 'EQUILIBRADO');
      expect(a).toBeGreaterThanOrEqual(1);
      expect(b).toBeLessThanOrEqual(6);
    }
  });

  it('sin indicar modo se comporta como AZAR', () => {
    expect(tirarDados('S', 4)).toEqual(tirarDados('S', 4, 'AZAR'));
  });

  it('AZAR y EQUILIBRADO no dan la misma serie', () => {
    const azar = Array.from({ length: 36 }, (_, i) => tirarDados('S', i, 'AZAR').join());
    expect(azar).not.toEqual(bloque('S', 0));
  });
});
