import { COSTOS, limitesDePiezas } from './costos.js';

describe('COSTOS', () => {
  it('camino: 1 madera + 1 ladrillo', () => {
    expect(COSTOS.CAMINO).toEqual({ MADERA: 1, LADRILLO: 1 });
  });

  it('poblado: 1 madera + 1 ladrillo + 1 oveja + 1 trigo', () => {
    expect(COSTOS.POBLADO).toEqual({ MADERA: 1, LADRILLO: 1, OVEJA: 1, TRIGO: 1 });
  });

  it('ciudad: 2 trigos + 3 minerales', () => {
    expect(COSTOS.CIUDAD).toEqual({ TRIGO: 2, MINERAL: 3 });
  });

  it('carta de desarrollo: 1 oveja + 1 trigo + 1 mineral', () => {
    expect(COSTOS.CARTA).toEqual({ OVEJA: 1, TRIGO: 1, MINERAL: 1 });
  });

  it('está congelado para que nadie lo modifique por accidente', () => {
    expect(Object.isFrozen(COSTOS)).toBe(true);
    expect(Object.isFrozen(COSTOS.CAMINO)).toBe(true);
  });
});

describe('limitesDePiezas', () => {
  it.each([2, 3, 4])('con %i jugadores: 15 caminos, 5 poblados, 4 ciudades', (jugadores) => {
    expect(limitesDePiezas(jugadores)).toEqual({ caminos: 15, poblados: 5, ciudades: 4 });
  });

  it.each([5, 6])('con %i jugadores: 20 caminos, 7 poblados, 5 ciudades', (jugadores) => {
    expect(limitesDePiezas(jugadores)).toEqual({ caminos: 20, poblados: 7, ciudades: 5 });
  });

  it.each([7, 8, 10])('con %i jugadores: 25 caminos, 8 poblados, 6 ciudades', (jugadores) => {
    expect(limitesDePiezas(jugadores)).toEqual({ caminos: 25, poblados: 8, ciudades: 6 });
  });

  it.each([1, 11, 3.5, Number.NaN])('rechaza %s jugadores', (jugadores) => {
    expect(() => limitesDePiezas(jugadores)).toThrow(/jugadores/);
  });

  it('crece sin bajar nunca al sumar jugadores', () => {
    for (let j = 2; j < 10; j++) {
      const a = limitesDePiezas(j);
      const b = limitesDePiezas(j + 1);
      expect(b.caminos).toBeGreaterThanOrEqual(a.caminos);
      expect(b.poblados).toBeGreaterThanOrEqual(a.poblados);
      expect(b.ciudades).toBeGreaterThanOrEqual(a.ciudades);
    }
  });
});
