import { describe, expect, it } from 'vitest';
import { moduloDePrueba } from '../pruebas-nest.js';
import { RepositorioSalasMemoria } from '../../infra/salas/repositorio-salas.memoria.js';
import { RepositorioSalas } from '../../infra/salas/repositorio-salas.js';
import { JuegoModule } from './juego.module.js';
import { PartidasService } from './partidas.service.js';
import { SalasService } from './salas.service.js';

describe('JuegoModule', () => {
  it('Nest lo monta y da una única instancia de cada servicio', async () => {
    const modulo = await moduloDePrueba([JuegoModule])
      .overrideProvider(RepositorioSalas)
      .useValue(new RepositorioSalasMemoria())
      .compile();
    const partidas = modulo.get(PartidasService);
    expect(partidas).toBeInstanceOf(PartidasService);
    expect(modulo.get(PartidasService)).toBe(partidas);
    expect(modulo.get(SalasService)).toBeInstanceOf(SalasService);
    const { id } = partidas.crear(['ana', 'beto']);
    expect(partidas.obtener(id)).toBeDefined();
  });
});
