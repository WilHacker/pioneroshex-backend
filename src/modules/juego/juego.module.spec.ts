import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { JuegoModule } from './juego.module.js';
import { PartidasService } from './partidas.service.js';

describe('JuegoModule', () => {
  it('Nest lo monta y da una única instancia de PartidasService', async () => {
    const modulo = await Test.createTestingModule({ imports: [JuegoModule] }).compile();
    const servicio = modulo.get(PartidasService);
    expect(servicio).toBeInstanceOf(PartidasService);
    expect(modulo.get(PartidasService)).toBe(servicio);
    const { id } = servicio.crear(['ana', 'beto']);
    expect(servicio.obtener(id)).toBeDefined();
  });
});
