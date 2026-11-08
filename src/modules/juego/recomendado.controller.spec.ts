import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { recomendadoPara } from '../../core/partida/recomendado.js';
import { RecomendadoController } from './recomendado.controller.js';

describe('RecomendadoController', () => {
  const controlador = new RecomendadoController();

  it('GET /recomendado/6 devuelve los ajustes para 6 jugadores', () => {
    expect(controlador.para('6')).toEqual(recomendadoPara(6));
  });

  it.each(['0', '1', '13', '2.5', 'abc', '', '6x', '-4', '1e1', ' 6'])(
    'rechaza %j con 400',
    (valor) => {
      expect(() => controlador.para(valor)).toThrow(BadRequestException);
    },
  );
});
