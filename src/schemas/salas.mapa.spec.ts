import { esquemaCambiarSala, esquemaEmpezar } from './salas.js';

describe('esquemas de sala con mapa', () => {
  it.each(['clasico', 'lagos', 'fiebre-del-oro', 'reino-unido'])(
    'acepta el mapa del catálogo «%s»',
    (mapa) => {
      expect(esquemaCambiarSala.safeParse({ mapa }).success).toBe(true);
      expect(esquemaEmpezar.safeParse({ mapa }).success).toBe(true);
    },
  );

  it('acepta null para volver al mapa automático', () => {
    expect(esquemaCambiarSala.safeParse({ mapa: null }).success).toBe(true);
  });

  it.each(['no-existe', 'constructor', '__proto__', 'LAGOS', '../lagos', '', 'lagos '])(
    'rechaza el mapa %j',
    (mapa) => {
      expect(esquemaCambiarSala.safeParse({ mapa }).success).toBe(false);
    },
  );

  it('rechaza casillas o cualquier otra cosa que no sea el id de un mapa', () => {
    expect(esquemaCambiarSala.safeParse({ mapa: [[0, 0]] }).success).toBe(false);
    expect(esquemaCambiarSala.safeParse({ mapa: { casillas: [[0, 0]] } }).success).toBe(false);
    expect(esquemaCambiarSala.safeParse({ mapa: 7 }).success).toBe(false);
  });

  it('sigue aceptando un cuerpo sin mapa', () => {
    expect(esquemaCambiarSala.safeParse({ publica: true }).success).toBe(true);
  });
});
