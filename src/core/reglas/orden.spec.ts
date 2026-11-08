import { describe, expect, it } from 'vitest';
import { ordenPorDados, type Sorteo } from './orden.js';

const IDS = ['a', 'b', 'c', 'd', 'e', 'f'];
const total = (dados: readonly [number, number]): number => dados[0] + dados[1];

/** Los totales de la primera ronda por jugador. */
const primeraRonda = (s: Sorteo): Map<string, number> =>
  new Map(s.rondas[0]!.map((t) => [t.jugador, total(t.dados)]));

describe('ordenPorDados', () => {
  it('devuelve a todos los jugadores, sin repetir ni perder ninguno', () => {
    for (const semilla of ['x1', 'x2', 'x3', 'x4', 'x5']) {
      const { orden } = ordenPorDados(IDS, semilla);
      expect(orden.toSorted()).toEqual([...IDS].toSorted());
    }
  });

  it('es determinista: la misma semilla da siempre el mismo sorteo', () => {
    expect(ordenPorDados(IDS, 'igual')).toEqual(ordenPorDados(IDS, 'igual'));
  });

  it('otra semilla da otro sorteo (no es un orden fijo)', () => {
    const distintos = new Set(
      Array.from({ length: 30 }, (_, i) => ordenPorDados(IDS, `semilla-${i}`).orden.join('')),
    );
    expect(distintos.size).toBeGreaterThan(5);
  });

  it('en la primera ronda tiran todos, con dos dados entre 1 y 6', () => {
    const s = ordenPorDados(IDS, 'ronda0');
    expect(s.rondas[0]!.map((t) => t.jugador).toSorted()).toEqual([...IDS].toSorted());
    for (const t of s.rondas.flat()) {
      for (const d of t.dados) {
        expect(Number.isInteger(d) && d >= 1 && d <= 6).toBe(true);
      }
    }
  });

  it('el que saca más va primero y el orden baja con los totales de la primera ronda', () => {
    for (const semilla of ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8']) {
      const s = ordenPorDados(IDS, semilla);
      const totales = primeraRonda(s);
      const ordenados = s.orden.map((id) => totales.get(id)!);
      expect(ordenados).toEqual(ordenados.toSorted((x, y) => y - x));
    }
  });

  it('si hay empate, solo vuelven a tirar los empatados', () => {
    const conEmpate = Array.from({ length: 80 }, (_, i) => ordenPorDados(IDS, `emp-${i}`)).find(
      (s) => s.rondas.length > 1,
    )!;
    expect(conEmpate).toBeDefined();
    const empatados = new Set(conEmpate.rondas[1]!.map((t) => t.jugador));
    const totales = primeraRonda(conEmpate);
    // Cada uno de los que repiten compartía total con otro de los que repiten.
    for (const id of empatados) {
      const iguales = [...totales].filter(([otro, t]) => otro !== id && t === totales.get(id));
      expect(iguales.length).toBeGreaterThan(0);
    }
    // Y quien no empató con nadie no vuelve a tirar.
    for (const [id, t] of totales) {
      const solos = [...totales.values()].filter((x) => x === t).length === 1;
      if (solos) expect(empatados.has(id)).toBe(false);
    }
  });

  it('los empatados se ordenan entre ellos por su nueva tirada, y se quedan en su sitio del orden', () => {
    const s = Array.from({ length: 80 }, (_, i) => ordenPorDados(IDS, `sitio-${i}`)).find(
      (x) => x.rondas.length > 1,
    )!;
    const totales = primeraRonda(s);
    const posiciones = s.orden.map((id) => totales.get(id)!);
    // Los totales de la primera ronda nunca suben a lo largo del orden: los empates quedan juntos.
    expect(posiciones).toEqual(posiciones.toSorted((x, y) => y - x));
  });

  it('con un solo jugador no hay nada que sortear', () => {
    expect(ordenPorDados(['solo'], 'x')).toEqual({ orden: ['solo'], rondas: [] });
  });

  it('con 12 jugadores siempre se resuelve y no se queda en bucle', () => {
    const doce = Array.from({ length: 12 }, (_, i) => `j${i}`);
    for (let i = 0; i < 50; i++) {
      const { orden } = ordenPorDados(doce, `doce-${i}`);
      expect(new Set(orden).size).toBe(12);
    }
  });

  it('un orden de ids repetidos o vacío se rechaza', () => {
    expect(() => ordenPorDados(['a', 'a'], 'x')).toThrow();
    expect(() => ordenPorDados([], 'x')).toThrow();
  });

  it('no depende del orden en que se pasan los jugadores', () => {
    const uno = ordenPorDados(['a', 'b', 'c', 'd'], 'indep').orden;
    const otro = ordenPorDados(['d', 'c', 'b', 'a'], 'indep').orden;
    expect(otro).toEqual(uno);
  });
});
