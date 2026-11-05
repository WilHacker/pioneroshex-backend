import { describe, expect, it } from 'vitest';
import { esquemaCrearSala, esquemaEmpezar, esquemaUnirse } from './salas.js';

describe('esquemas de sala', () => {
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
