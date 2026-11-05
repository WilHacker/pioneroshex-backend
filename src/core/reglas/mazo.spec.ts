import fc from 'fast-check';
import { CARTAS_BASE, composicionDelMazo, crearMazo, type CartaDesarrollo } from './mazo.js';

function contar(cartas: readonly CartaDesarrollo[]): Record<string, number> {
  const cuentas: Record<string, number> = {};
  for (const carta of cartas) cuentas[carta] = (cuentas[carta] ?? 0) + 1;
  return cuentas;
}

describe('composicionDelMazo', () => {
  it('el mazo base tiene 25 cartas: 14 caballeros, 5 puntos, 2 + 2 + 2 de progreso', () => {
    expect(CARTAS_BASE).toEqual({
      CABALLERO: 14,
      PUNTO_VICTORIA: 5,
      CONSTRUCCION_CARRETERAS: 2,
      ABUNDANCIA: 2,
      MONOPOLIO: 2,
    });
  });

  it.each([2, 3, 4])('con %i jugadores es el mazo base (25 cartas)', (jugadores) => {
    expect(composicionDelMazo(jugadores)).toEqual(CARTAS_BASE);
  });

  it.each([
    [5, 2],
    [8, 2],
    [9, 3],
    [10, 3],
  ])('con %i jugadores el mazo base se multiplica por %i', (jugadores, veces) => {
    const composicion = composicionDelMazo(jugadores);
    for (const [carta, base] of Object.entries(CARTAS_BASE)) {
      expect(composicion[carta as CartaDesarrollo]).toBe(base * veces);
    }
  });

  it.each([1, 11, 3.5, Number.NaN])('rechaza %s jugadores', (jugadores) => {
    expect(() => composicionDelMazo(jugadores)).toThrow(/jugadores/);
  });

  it('propiedad: el total es 25 × ceil(jugadores / 4)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 10 }), (jugadores) => {
        const total = Object.values(composicionDelMazo(jugadores)).reduce((a, b) => a + b, 0);
        expect(total).toBe(25 * Math.ceil(jugadores / 4));
      }),
    );
  });

  it('devuelve un objeto nuevo: modificarlo no altera el siguiente', () => {
    const primero = composicionDelMazo(4) as Record<CartaDesarrollo, number>;
    primero.CABALLERO = 0;
    expect(composicionDelMazo(4).CABALLERO).toBe(14);
    expect(CARTAS_BASE.CABALLERO).toBe(14);
  });
});

describe('crearMazo', () => {
  it('tiene todas las cartas de la composición, barajadas', () => {
    const mazo = crearMazo(4, 'ANDES-2026');
    expect(mazo).toHaveLength(25);
    expect(contar(mazo)).toEqual(CARTAS_BASE);
  });

  it('con 6 jugadores tiene 50 cartas', () => {
    const mazo = crearMazo(6, 'ANDES-2026');
    expect(mazo).toHaveLength(50);
    expect(contar(mazo).CABALLERO).toBe(28);
  });

  it('la misma semilla da el mismo orden', () => {
    expect(crearMazo(4, 'ANDES-2026')).toEqual(crearMazo(4, 'ANDES-2026'));
  });

  it('semillas distintas dan órdenes distintos', () => {
    expect(crearMazo(4, 'ANDES-2026')).not.toEqual(crearMazo(4, 'OTRA-SEMILLA'));
  });

  it('propiedad: con cualquier semilla se conserva la composición', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.integer({ min: 2, max: 10 }), (semilla, j) => {
        expect(contar(crearMazo(j, semilla))).toEqual(composicionDelMazo(j));
      }),
      { numRuns: 50 },
    );
  });

  it.each([1, 11])('rechaza %i jugadores', (jugadores) => {
    expect(() => crearMazo(jugadores, 'X')).toThrow(/jugadores/);
  });
});
