import { describe, expect, it } from 'vitest';
import { crearMesa } from '../../core/estado/mesa.js';
import { RepositorioSalasMemoria } from '../../infra/salas/repositorio-salas.memoria.js';
import { esquemaCambiarSala, esquemaCrearSala, esquemaEmpezar } from '../../schemas/salas.js';
import { PartidasService } from './partidas.service.js';
import { SalasService } from './salas.service.js';

describe('esquemas: modoComercio y maxOfertasPorTurno', () => {
  it.each(['LIBRE', 'PRIVADO', 'SOLO_BANCO'])(
    'acepta el modo %s en crear, cambiar y empezar',
    (m) => {
      expect(esquemaCrearSala.safeParse({ nombre: 'Ana', modoComercio: m }).success).toBe(true);
      expect(esquemaCambiarSala.safeParse({ modoComercio: m }).success).toBe(true);
      expect(esquemaEmpezar.safeParse({ modoComercio: m }).success).toBe(true);
    },
  );

  it.each(['libre', 'PUBLICO', '', 3, null])('rechaza el modo %j', (m) => {
    expect(esquemaCambiarSala.safeParse({ modoComercio: m }).success).toBe(false);
  });

  it.each([0, 1, 3, 20])('acepta un tope de %i ofertas', (n) => {
    expect(esquemaCambiarSala.safeParse({ maxOfertasPorTurno: n }).success).toBe(true);
  });

  it.each([-1, 21, 1.5, '3', null])('rechaza un tope de %j', (n) => {
    expect(esquemaCambiarSala.safeParse({ maxOfertasPorTurno: n }).success).toBe(false);
  });
});

describe('SalasService: reglas de comercio en la partida', () => {
  it('las reglas elegidas llegan a la partida', async () => {
    const salas = new SalasService(new PartidasService(), new RepositorioSalasMemoria(), {
      ahora: () => 1_000,
    });
    const ana = await salas.crear('Ana', false, undefined, {
      modoComercio: 'PRIVADO',
      maxOfertasPorTurno: 2,
    });
    await salas.unirse(ana.salaId, 'Beto');
    await salas.empezar(ana.salaId, ana.token, {});
    const { config } = salas.partida(ana.salaId)!.estado;
    expect(config.modoComercio).toBe('PRIVADO');
    expect(config.maxOfertasPorTurno).toBe(2);
  });

  it('restaurar admite partidas guardadas antes de que existiera el tope de ofertas', () => {
    const origen = new PartidasService().crear(['ana', 'beto']);
    const mesa = crearMesa(origen.actor.estado.config);
    const { ofertasEsteTurno: _a, sorteo: _b, abandonados: _c, ...antiguo } = origen.actor.estado;
    const actor = new PartidasService().restaurar('viejo111', mesa, antiguo as never);
    expect(actor.estado.ofertasEsteTurno).toBe(0);
    expect(actor.estado.sorteo).toEqual([]);
    expect(actor.estado.abandonados).toEqual([]);
  });
});
