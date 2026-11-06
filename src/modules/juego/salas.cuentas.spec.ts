import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { RepositorioHistorialMemoria } from '../../infra/historial/repositorio-historial.memoria.js';
import { RepositorioSalasMemoria } from '../../infra/salas/repositorio-salas.memoria.js';
import { PartidasService } from './partidas.service.js';
import { SalasService } from './salas.service.js';

function crear() {
  const repo = new RepositorioSalasMemoria();
  const partidas = new PartidasService();
  const historial = new RepositorioHistorialMemoria();
  const hacer = () => new SalasService(partidas, repo, { ahora: () => 5_000, historial });
  return { repo, partidas, historial, salas: hacer(), hacer };
}

const estado = async (promesa: Promise<unknown>): Promise<number> => {
  try {
    await promesa;
  } catch (e) {
    return (e as HttpException).getStatus();
  }
  throw new Error('no falló');
};

/** Una sala con Ana (cuenta u-ana) y Beto (invitado) ya empezada. */
async function partidaEmpezada() {
  const ctx = crear();
  const a = await ctx.salas.crear('Ana', false, 'u-ana');
  await ctx.salas.unirse(a.salaId, 'Beto');
  await ctx.salas.empezar(a.salaId, a.token, {});
  const actor = ctx.salas.partida(a.salaId);
  if (!actor) throw new Error('no hay partida');
  return { ...ctx, salaId: a.salaId, estadoActual: actor.estado };
}

describe('SalasService: cuentas en las salas', () => {
  it('guarda a qué cuenta pertenece cada jugador, sin mostrarlo en el estado público', async () => {
    const { salas, repo } = crear();
    const a = await salas.crear('Ana', false, 'u-ana');
    await salas.unirse(a.salaId, 'Beto', 'u-beto');

    const guardada = (await repo.cargarTodas())[0];
    expect(guardada?.jugadores.map((j) => j.usuarioId)).toEqual(['u-ana', 'u-beto']);
    expect(JSON.stringify(salas.estado(a.salaId))).not.toContain('u-ana');
  });

  it('una misma cuenta no puede ocupar dos asientos de la misma sala (409)', async () => {
    const { salas } = crear();
    const a = await salas.crear('Ana', false, 'u-ana');

    expect(await estado(salas.unirse(a.salaId, 'Ana otra vez', 'u-ana'))).toBe(409);
    await expect(salas.unirse(a.salaId, 'Beto', 'u-beto')).resolves.toBeDefined();
  });

  it('los invitados pueden repetir nombre: no tienen cuenta que comparar', async () => {
    const { salas } = crear();
    const a = await salas.crear('Ana');

    await expect(salas.unirse(a.salaId, 'Ana')).resolves.toBeDefined();
    await expect(salas.unirse(a.salaId, 'Ana')).resolves.toBeDefined();
  });
});

describe('SalasService: historial al terminar', () => {
  it('registra la partida con sus participantes; el invitado queda sin cuenta', async () => {
    const { salas, historial, salaId, estadoActual } = await partidaEmpezada();

    await salas.registrarSiTermino(salaId, { ...estadoActual, ganador: 'j1' });

    const ana = await historial.estadisticasDe('u-ana');
    expect(ana).toMatchObject({ partidas: 1, victorias: 1 });
    expect(ana.ultimas[0]).toMatchObject({
      partidaId: salaId,
      ganador: 'Ana',
      jugadores: 2,
      gano: true,
    });
  });

  it('el perdedor con cuenta cuenta la partida pero no la victoria', async () => {
    const ctx = crear();
    const a = await ctx.salas.crear('Ana', false, 'u-ana');
    await ctx.salas.unirse(a.salaId, 'Beto', 'u-beto');
    await ctx.salas.empezar(a.salaId, a.token, {});
    const actor = ctx.salas.partida(a.salaId);

    await ctx.salas.registrarSiTermino(a.salaId, { ...actor!.estado, ganador: 'j1' });

    expect(await ctx.historial.estadisticasDe('u-beto')).toMatchObject({
      partidas: 1,
      victorias: 0,
    });
  });

  it('una partida solo de invitados no se guarda', async () => {
    const ctx = crear();
    const a = await ctx.salas.crear('Ana');
    await ctx.salas.unirse(a.salaId, 'Beto');
    await ctx.salas.empezar(a.salaId, a.token, {});
    const actor = ctx.salas.partida(a.salaId);

    await ctx.salas.registrarSiTermino(a.salaId, { ...actor!.estado, ganador: 'j1' });

    expect(
      await ctx.historial.registrar({
        id: a.salaId,
        terminadaEn: 1,
        puntosVictoria: 10,
        ganador: 'x',
        participantes: [],
      }),
    ).toBe(true);
  });

  it('sin ganador no registra nada, y registrar dos veces no duplica', async () => {
    const { salas, historial, salaId, estadoActual } = await partidaEmpezada();

    await salas.registrarSiTermino(salaId, estadoActual);
    expect((await historial.estadisticasDe('u-ana')).partidas).toBe(0);
    await salas.registrarSiTermino(salaId, { ...estadoActual, ganador: 'j2' });
    await salas.registrarSiTermino(salaId, { ...estadoActual, ganador: 'j2' });

    expect(await historial.estadisticasDe('u-ana')).toMatchObject({ partidas: 1, victorias: 0 });
  });

  it('si el servidor se reinicia con una partida ya terminada, la registra al restaurar', async () => {
    const ctx = await partidaEmpezada();
    const filas = await ctx.repo.cargarTodas();
    const terminada = { ...filas[0]!, estado: { ...ctx.estadoActual, ganador: 'j1' } };
    await ctx.repo.guardar(terminada);

    const otro = new SalasService(new PartidasService(), ctx.repo, {
      ahora: () => 9_000,
      historial: ctx.historial,
    });
    await otro.onModuleInit();
    otro.onModuleDestroy();
    await new Promise((r) => setTimeout(r, 20));

    expect((await ctx.historial.estadisticasDe('u-ana')).victorias).toBe(1);
  });

  it('si el historial falla, la partida sigue y el error solo se registra en el log', async () => {
    const ctx = await partidaEmpezada();
    const roto = new RepositorioHistorialMemoria();
    roto.registrar = () => Promise.reject(new Error('base caída'));
    const salas = new SalasService(new PartidasService(), ctx.repo, {
      ahora: () => 5_000,
      historial: roto,
    });
    await salas.onModuleInit();
    salas.onModuleDestroy();

    await expect(
      salas.registrarSiTermino(ctx.salaId, { ...ctx.estadoActual, ganador: 'j1' }),
    ).resolves.toBeUndefined();
  });
});
