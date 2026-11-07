import { JUGADORES_MAX, crearGameConfig } from './game-config.js';

const BASE = { semillaMapa: 'MAPA-DOCE', semillaAzar: '#azar-doce' };

describe('hasta 12 jugadores', () => {
  it('el tope del juego es 12', () => {
    expect(JUGADORES_MAX).toBe(12);
  });

  it.each([11, 12])('acepta %i jugadores', (jugadores) => {
    expect(crearGameConfig({ ...BASE, jugadores }).jugadores).toBe(jugadores);
  });

  it('rechaza 13 jugadores', () => {
    expect(() => crearGameConfig({ ...BASE, jugadores: 13 })).toThrow(/entre 2 y 12/);
  });

  it.each([11, 12])(
    'con %i jugadores el mapa por defecto es de radio 4 (150 vértices)',
    (jugadores) => {
      expect(crearGameConfig({ ...BASE, jugadores }).radio).toBe(4);
    },
  );

  it.each([5, 8, 9, 10])(
    'de 5 a 10 jugadores el mapa por defecto sigue siendo de radio 3',
    (jugadores) => {
      expect(crearGameConfig({ ...BASE, jugadores }).radio).toBe(3);
    },
  );

  it('con 12 jugadores el modo A sube el límite de mano a 9 y el B lo deja en 7', () => {
    expect(crearGameConfig({ ...BASE, jugadores: 12, turnRuleMode: 'A' }).robberHandLimit).toBe(9);
    expect(crearGameConfig({ ...BASE, jugadores: 12, turnRuleMode: 'B' }).robberHandLimit).toBe(7);
  });

  it('12 jugadores caben en el radio 3 (96 vértices) pero no en el 2', () => {
    expect(() => crearGameConfig({ ...BASE, jugadores: 12, radio: 3 })).not.toThrow();
    expect(() => crearGameConfig({ ...BASE, jugadores: 12, radio: 2 })).toThrow(/muy pequeño/);
  });
});
