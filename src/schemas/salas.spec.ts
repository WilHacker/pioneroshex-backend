import { describe, expect, it } from 'vitest';
import { JUGADORES_MAX, JUGADORES_MIN } from '../core/partida/game-config.js';
import { recomendadoPara } from '../core/partida/recomendado.js';
import {
  esquemaCambiarSala,
  esquemaCrearSala,
  esquemaEmpezar,
  esquemaUnirse,
  TIEMPOS_DE_TURNO,
} from './salas.js';

describe('esquemas de sala', () => {
  const rango = Array.from(
    { length: JUGADORES_MAX - JUGADORES_MIN + 1 },
    (_, i) => JUGADORES_MIN + i,
  );

  it.each(rango)('para %i jugadores todo lo recomendado lo acepta el servidor', (n) => {
    const { turnoSegundos, ...resto } = recomendadoPara(n);
    expect(TIEMPOS_DE_TURNO).toContain(turnoSegundos);
    expect(esquemaCambiarSala.safeParse({ ...resto, turnoSegundos }).success).toBe(true);
  });

  it('el nombre se recorta y no puede quedar vacío ni pasar de 20 caracteres', () => {
    expect(esquemaUnirse.parse({ nombre: '  Ana  ' })).toEqual({ nombre: 'Ana' });
    expect(esquemaUnirse.safeParse({ nombre: '   ' }).success).toBe(false);
    expect(esquemaUnirse.safeParse({ nombre: 'x'.repeat(21) }).success).toBe(false);
    expect(esquemaUnirse.safeParse({}).success).toBe(false);
    expect(esquemaCrearSala.safeParse({ nombre: 5 }).success).toBe(false);
  });

  it('los nombres no pueden llevar caracteres de control', () => {
    expect(esquemaUnirse.safeParse({ nombre: 'a\nb' }).success).toBe(false);
  });

  it('empezar admite opciones del anfitrión acotadas, y ninguna es obligatoria', () => {
    expect(esquemaEmpezar.parse({})).toEqual({});
    expect(
      esquemaEmpezar.parse({ puntosVictoria: 8, turnRuleMode: 'B', semillaMapa: 'ANDES' }),
    ).toEqual({
      puntosVictoria: 8,
      turnRuleMode: 'B',
      semillaMapa: 'ANDES',
    });
    expect(esquemaEmpezar.safeParse({ puntosVictoria: 2 }).success).toBe(false);
    expect(esquemaEmpezar.safeParse({ puntosVictoria: 99 }).success).toBe(false);
    expect(esquemaEmpezar.safeParse({ turnRuleMode: 'Z' }).success).toBe(false);
    expect(esquemaEmpezar.parse({ modoDados: 'EQUILIBRADO' })).toEqual({
      modoDados: 'EQUILIBRADO',
    });
    expect(esquemaEmpezar.safeParse({ modoDados: 'TRAMPA' }).success).toBe(false);
    expect(esquemaEmpezar.safeParse({ semillaAzar: 'x' }).success).toBe(false);
  });
});
