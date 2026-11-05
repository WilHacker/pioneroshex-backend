import { JUGADORES_MAX, JUGADORES_MIN, crearGameConfig, type GameConfig } from './game-config.js';

describe('crearGameConfig', () => {
  it('con solo la semilla da la partida clásica: 4 jugadores, radio 2, límite de mano 7', () => {
    expect(crearGameConfig({ semilla: 'ANDES-2026' })).toEqual<GameConfig>({
      semilla: 'ANDES-2026',
      jugadores: 4,
      radio: 2,
      turnRuleMode: 'A',
      robberHandLimit: 7,
    });
  });

  it('respeta lo que el anfitrión fija', () => {
    const config = crearGameConfig({
      semilla: 'X',
      jugadores: 3,
      radio: 1,
      turnRuleMode: 'B',
      robberHandLimit: 8,
    });
    expect(config).toEqual({
      semilla: 'X',
      jugadores: 3,
      radio: 1,
      turnRuleMode: 'B',
      robberHandLimit: 8,
    });
  });

  describe('valores por defecto según el número de jugadores', () => {
    it.each([2, 3, 4])('con %i jugadores usa el mapa clásico y límite 7', (jugadores) => {
      const config = crearGameConfig({ semilla: 'X', jugadores });
      expect(config.radio).toBe(2);
      expect(config.robberHandLimit).toBe(7);
    });

    it.each([5, 6, 8, 10])('con %i jugadores el mapa crece a radio 3', (jugadores) => {
      expect(crearGameConfig({ semilla: 'X', jugadores }).radio).toBe(3);
    });

    it('con 5 o más jugadores, el modo A sube el límite de mano a 9', () => {
      const config = crearGameConfig({ semilla: 'X', jugadores: 6, turnRuleMode: 'A' });
      expect(config.robberHandLimit).toBe(9);
    });

    it('con 5 o más jugadores, el modo B (clásico) mantiene el límite en 7', () => {
      const config = crearGameConfig({ semilla: 'X', jugadores: 6, turnRuleMode: 'B' });
      expect(config.robberHandLimit).toBe(7);
    });
  });

  describe('validación', () => {
    it('acepta los extremos de jugadores', () => {
      expect(crearGameConfig({ semilla: 'X', jugadores: JUGADORES_MIN }).jugadores).toBe(2);
      expect(crearGameConfig({ semilla: 'X', jugadores: JUGADORES_MAX }).jugadores).toBe(10);
    });

    it.each([1, 11, 0, -3, 2.5, Number.NaN])('rechaza %s jugadores', (jugadores) => {
      expect(() => crearGameConfig({ semilla: 'X', jugadores })).toThrow(/jugadores/);
    });

    it.each([-1, 1.5, Number.NaN])('rechaza el radio %s', (radio) => {
      expect(() => crearGameConfig({ semilla: 'X', radio })).toThrow(/radio/);
    });

    it.each([0, 1, 3.5, Number.NaN])('rechaza el límite de mano %s', (robberHandLimit) => {
      expect(() => crearGameConfig({ semilla: 'X', robberHandLimit })).toThrow(/robberHandLimit/);
    });

    it.each(['', '   '])('rechaza la semilla vacía %j', (semilla) => {
      expect(() => crearGameConfig({ semilla })).toThrow(/semilla/);
    });

    it('rechaza un modo de turnos desconocido', () => {
      expect(() => crearGameConfig({ semilla: 'X', turnRuleMode: 'Z' as unknown as 'A' })).toThrow(
        /turnRuleMode/,
      );
    });

    it('rechaza un mapa que no alcanza para los jugadores (radio 0 = 1 casilla)', () => {
      expect(() => crearGameConfig({ semilla: 'X', jugadores: 4, radio: 0 })).toThrow(/radio/);
    });
  });

  it('devuelve un objeto congelado y no toca la entrada', () => {
    const entrada = { semilla: 'X' };
    const config = crearGameConfig(entrada);
    expect(Object.isFrozen(config)).toBe(true);
    expect(entrada).toEqual({ semilla: 'X' });
  });
});
