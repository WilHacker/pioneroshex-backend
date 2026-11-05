import { JUGADORES_MAX, JUGADORES_MIN, crearGameConfig, type GameConfig } from './game-config.js';

describe('crearGameConfig', () => {
  it('con las dos semillas da la partida clásica', () => {
    expect(
      crearGameConfig({ semillaMapa: 'ANDES-2026', semillaAzar: 'AZAR-SECRETO' }),
    ).toEqual<GameConfig>({
      semillaMapa: 'ANDES-2026',
      semillaAzar: 'AZAR-SECRETO',
      jugadores: 4,
      radio: 2,
      turnRuleMode: 'A',
      robberHandLimit: 7,
      puntosVictoria: 10,
    });
  });

  it('permite separar semillaMapa y semillaAzar', () => {
    const config = crearGameConfig({
      semillaMapa: 'MAPA-PUBLICO',
      semillaAzar: 'AZAR-SECRETO',
    });
    expect(config.semillaMapa).toBe('MAPA-PUBLICO');
    expect(config.semillaAzar).toBe('AZAR-SECRETO');
  });

  it('no inventa la semillaAzar: el servidor debe darla (de un generador seguro)', () => {
    const sinAzar = { semillaMapa: 'MAPA-PUBLICO' } as unknown as Parameters<
      typeof crearGameConfig
    >[0];
    expect(() => crearGameConfig(sinAzar)).toThrow(/semilla del azar/);
  });

  it.each([
    ['igual a la del mapa', 'IGUAL', 'IGUAL'],
    ['derivada de la del mapa (la empieza con ella)', 'MAPA', 'MAPA:azar'],
  ])('rechaza una semillaAzar %s: la vista pública la revelaría', (_caso, mapa, azar) => {
    expect(() => crearGameConfig({ semillaMapa: mapa, semillaAzar: azar })).toThrow(
      /independiente/,
    );
  });

  it('respeta lo que el anfitrión fija', () => {
    const config = crearGameConfig({
      semillaMapa: 'X',
      semillaAzar: 'AZAR-X',
      jugadores: 3,
      radio: 1,
      turnRuleMode: 'B',
      robberHandLimit: 8,
      puntosVictoria: 8,
    });
    expect(config).toEqual({
      semillaMapa: 'X',
      semillaAzar: 'AZAR-X',
      jugadores: 3,
      radio: 1,
      turnRuleMode: 'B',
      robberHandLimit: 8,
      puntosVictoria: 8,
    });
  });

  it('respeta los puntos de victoria fijados', () => {
    expect(
      crearGameConfig({ semillaMapa: 'X', semillaAzar: 'AZAR-X', puntosVictoria: 12 })
        .puntosVictoria,
    ).toBe(12);
  });

  describe('valores por defecto según el número de jugadores', () => {
    it.each([2, 3, 4])('con %i jugadores usa el mapa clásico y límite 7', (jugadores) => {
      const config = crearGameConfig({ semillaMapa: 'X', semillaAzar: 'AZAR-X', jugadores });
      expect(config.radio).toBe(2);
      expect(config.robberHandLimit).toBe(7);
    });

    it.each([5, 6, 8, 10])('con %i jugadores el mapa crece a radio 3', (jugadores) => {
      expect(crearGameConfig({ semillaMapa: 'X', semillaAzar: 'AZAR-X', jugadores }).radio).toBe(3);
    });

    it('con 5 o más jugadores, el modo A sube el límite de mano a 9', () => {
      const config = crearGameConfig({
        semillaMapa: 'X',
        semillaAzar: 'AZAR-X',
        jugadores: 6,
        turnRuleMode: 'A',
      });
      expect(config.robberHandLimit).toBe(9);
    });

    it('con 5 o más jugadores, el modo B (clásico) mantiene el límite en 7', () => {
      const config = crearGameConfig({
        semillaMapa: 'X',
        semillaAzar: 'AZAR-X',
        jugadores: 6,
        turnRuleMode: 'B',
      });
      expect(config.robberHandLimit).toBe(7);
    });
  });

  describe('validación', () => {
    it('acepta los extremos de jugadores', () => {
      expect(
        crearGameConfig({ semillaMapa: 'X', semillaAzar: 'AZAR-X', jugadores: JUGADORES_MIN })
          .jugadores,
      ).toBe(2);
      expect(
        crearGameConfig({ semillaMapa: 'X', semillaAzar: 'AZAR-X', jugadores: JUGADORES_MAX })
          .jugadores,
      ).toBe(10);
    });

    it.each([1, 11, 0, -3, 2.5, Number.NaN])('rechaza %s jugadores', (jugadores) => {
      expect(() => crearGameConfig({ semillaMapa: 'X', semillaAzar: 'AZAR-X', jugadores })).toThrow(
        /jugadores/,
      );
    });

    it.each([-1, 1.5, Number.NaN])('rechaza el radio %s', (radio) => {
      expect(() => crearGameConfig({ semillaMapa: 'X', semillaAzar: 'AZAR-X', radio })).toThrow(
        /radio/,
      );
    });

    it.each([0, 1, 3.5, Number.NaN])('rechaza el límite de mano %s', (robberHandLimit) => {
      expect(() =>
        crearGameConfig({ semillaMapa: 'X', semillaAzar: 'AZAR-X', robberHandLimit }),
      ).toThrow(/robberHandLimit/);
    });

    it.each([2, 2.5, Number.NaN, -1])('rechaza los puntos de victoria %s', (puntosVictoria) => {
      expect(() =>
        crearGameConfig({ semillaMapa: 'X', semillaAzar: 'AZAR-X', puntosVictoria }),
      ).toThrow(/puntosVictoria/);
    });

    it.each(['', '   '])('rechaza la semilla vacía %j', (semilla) => {
      expect(() => crearGameConfig({ semillaMapa: semilla, semillaAzar: 'AZAR' })).toThrow(
        /semilla/,
      );
    });

    it('rechaza semillaMapa vacía o semillaAzar vacía', () => {
      expect(() => crearGameConfig({ semillaMapa: '', semillaAzar: 'AZAR' })).toThrow(
        /semilla del mapa/,
      );
      expect(() => crearGameConfig({ semillaMapa: 'MAPA', semillaAzar: '' })).toThrow(
        /semilla del azar/,
      );
    });

    it('rechaza un modo de turnos desconocido', () => {
      expect(() =>
        crearGameConfig({
          semillaMapa: 'X',
          semillaAzar: 'AZAR-X',
          turnRuleMode: 'Z' as unknown as 'A',
        }),
      ).toThrow(/turnRuleMode/);
    });

    it('rechaza un mapa que no alcanza para los jugadores (radio 0 = 1 casilla)', () => {
      expect(() =>
        crearGameConfig({ semillaMapa: 'X', semillaAzar: 'AZAR-X', jugadores: 4, radio: 0 }),
      ).toThrow(/radio/);
    });

    // Cada poblado bloquea como mucho 4 vértices (el suyo y 3 vecinos): para que el último poblado
    // de la preparación tenga sitio hacen falta más de 4·(2n−1) vértices.
    it.each([
      [0, 2],
      [1, 4],
      [2, 8],
    ])(
      'rechaza radio %i con %i jugadores (la preparación quedaría congelada)',
      (radio, jugadores) => {
        expect(() =>
          crearGameConfig({ semillaMapa: 'X', semillaAzar: 'AZAR-X', jugadores, radio }),
        ).toThrow(/radio.*jugadores/);
      },
    );

    it.each([
      [1, 3],
      [2, 7],
      [3, 10],
    ])('acepta radio %i con %i jugadores', (radio, jugadores) => {
      expect(
        crearGameConfig({ semillaMapa: 'X', semillaAzar: 'AZAR-X', jugadores, radio }).radio,
      ).toBe(radio);
    });

    it.each([2, 3, 4, 5, 6, 7, 8, 9, 10])(
      'los valores por defecto con %i jugadores son válidos',
      (jugadores) => {
        expect(
          crearGameConfig({ semillaMapa: 'X', semillaAzar: 'AZAR-X', jugadores }).jugadores,
        ).toBe(jugadores);
      },
    );
  });

  it('devuelve un objeto congelado y no toca la entrada', () => {
    const entrada = { semillaMapa: 'X', semillaAzar: 'AZAR-X' };
    const config = crearGameConfig(entrada);
    expect(Object.isFrozen(config)).toBe(true);
    expect(entrada).toEqual({ semillaMapa: 'X', semillaAzar: 'AZAR-X' });
  });
});
