import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { RepositorioSalasMemoria } from '../../infra/salas/repositorio-salas.memoria.js';
import { esquemaCambiarSala } from '../../schemas/salas.js';
import { PartidasService } from './partidas.service.js';
import { SalasService } from './salas.service.js';

function crear() {
  const repo = new RepositorioSalasMemoria();
  const partidas = new PartidasService();
  const salas = new SalasService(partidas, repo, { ahora: () => 1_000 });
  return { repo, partidas, salas };
}

const estado = async (promesa: Promise<unknown>): Promise<number> => {
  try {
    await promesa;
  } catch (e) {
    return (e as HttpException).getStatus();
  }
  throw new Error('no falló');
};

describe('SalasService: sala pública y opciones', () => {
  it('una sala nueva es privada y sin opciones; la pública se pide al crearla', async () => {
    const { salas } = crear();
    const privada = await salas.crear('Ana');
    const publica = await salas.crear('Beto', true);

    expect(salas.estado(privada.salaId)).toMatchObject({ publica: false, opciones: {} });
    expect(salas.estado(publica.salaId).publica).toBe(true);
  });

  it('el anfitrión cambia las opciones y todos las ven', async () => {
    const { salas } = crear();
    const a = await salas.crear('Ana');

    await salas.cambiar(a.salaId, a.token, { puntosVictoria: 12, modoDados: 'EQUILIBRADO' });
    await salas.cambiar(a.salaId, a.token, { publica: true, robberHandLimit: 9 });

    expect(salas.estado(a.salaId)).toMatchObject({
      publica: true,
      opciones: { puntosVictoria: 12, modoDados: 'EQUILIBRADO', robberHandLimit: 9 },
    });
  });

  it('solo el anfitrión cambia opciones (403), con token válido (401) y antes de empezar (409)', async () => {
    const { salas } = crear();
    const a = await salas.crear('Ana');
    const b = await salas.unirse(a.salaId, 'Beto');

    expect(await estado(salas.cambiar(a.salaId, 'falso', {}))).toBe(401);
    expect(await estado(salas.cambiar(a.salaId, b.token, {}))).toBe(403);
    expect(await estado(salas.cambiar('00000000', a.token, {}))).toBe(404);
    await salas.empezar(a.salaId, a.token, {});
    expect(await estado(salas.cambiar(a.salaId, a.token, {}))).toBe(409);
  });

  it('al empezar usa las opciones guardadas y lo que se pase al empezar tiene prioridad', async () => {
    const { salas } = crear();
    const a = await salas.crear('Ana');
    await salas.unirse(a.salaId, 'Beto');
    await salas.cambiar(a.salaId, a.token, { puntosVictoria: 12, modoDados: 'EQUILIBRADO' });

    await salas.empezar(a.salaId, a.token, { puntosVictoria: 8 });

    const config = salas.partida(a.salaId)?.estado.config;
    expect(config?.puntosVictoria).toBe(8);
    expect(config?.modoDados).toBe('EQUILIBRADO');
  });

  it('las opciones y la visibilidad sobreviven a un reinicio', async () => {
    const { repo, partidas, salas } = crear();
    const a = await salas.crear('Ana', true);
    await salas.cambiar(a.salaId, a.token, { puntosVictoria: 14 });

    const otra = new SalasService(partidas, repo, { ahora: () => 2_000 });
    await otra.onModuleInit();
    otra.onModuleDestroy();

    expect(otra.estado(a.salaId)).toMatchObject({
      publica: true,
      opciones: { puntosVictoria: 14 },
    });
  });
});

describe('SalasService: salas abiertas', () => {
  it('lista solo las públicas que no han empezado, sin ids de jugador ni tokens', async () => {
    const { salas } = crear();
    const abierta = await salas.crear('Ana', true);
    await salas.unirse(abierta.salaId, 'Beto');
    await salas.crear('Cleo');
    const empezada = await salas.crear('Dani', true);
    await salas.unirse(empezada.salaId, 'Eva');
    await salas.empezar(empezada.salaId, empezada.token, {});

    expect(salas.abiertas()).toEqual([
      { id: abierta.salaId, anfitrion: 'Ana', jugadores: 2, maximo: 12 },
    ]);
  });

  it('muestra como máximo 50 salas', async () => {
    const { salas } = crear();
    await Promise.all(Array.from({ length: 52 }, (_, i) => salas.crear(`J${i}`, true)));

    expect(salas.abiertas()).toHaveLength(50);
  });
});

const llenar = async (jugadores: number, reglas: Parameters<SalasService['empezar']>[2]) => {
  const { salas } = crear();
  const a = await salas.crear('J1');
  await Promise.all(
    Array.from({ length: jugadores - 1 }, (_, i) => salas.unirse(a.salaId, `J${i + 2}`)),
  );
  await salas.empezar(a.salaId, a.token, reglas);
  const actor = salas.partida(a.salaId);
  if (!actor) throw new Error('no hay partida');
  return actor.estado;
};

describe('SalasService: partidas con muchos jugadores', () => {
  it('con 10 jugadores el mapa es más grande y todos entran en el orden de turno', async () => {
    const inicial = await llenar(10, { turnRuleMode: 'B' });

    expect(inicial.config.jugadores).toBe(10);
    expect(inicial.config.turnRuleMode).toBe('B');
    expect(inicial.config.radio).toBeGreaterThan(2);
    expect(new Set(inicial.jugadores.map((j) => j.id)).size).toBe(10);
  });

  it('con 4 jugadores se queda el mapa clásico', async () => {
    const inicial = await llenar(4, {});

    expect(inicial.config.radio).toBe(2);
  });

  it('de 5 a 12 jugadores siempre se puede empezar, con cualquier modo de turnos', async () => {
    const casos = [5, 6, 7, 8, 9, 10, 11, 12].flatMap((n) =>
      (['A', 'B'] as const).map((turnRuleMode) => ({ n, turnRuleMode })),
    );

    const partidas = await Promise.all(
      casos.map((c) => llenar(c.n, { turnRuleMode: c.turnRuleMode })),
    );

    partidas.forEach((partida, i) => expect(partida.config.jugadores).toBe(casos[i]!.n));
  });
});

describe('SalasService: tiempo por turno', () => {
  it('se guarda como opción de la sala y los valores raros se rechazan en el esquema', async () => {
    const { salas } = crear();
    const a = await salas.crear('Ana');

    await salas.cambiar(a.salaId, a.token, { turnoSegundos: 60 });

    expect(salas.estado(a.salaId).opciones).toMatchObject({ turnoSegundos: 60 });
    for (const bueno of [0, 30, 60, 90, 120, 180]) {
      expect(esquemaCambiarSala.safeParse({ turnoSegundos: bueno }).success).toBe(true);
    }
    for (const malo of [-1, 45, 1000, '60', 60.5]) {
      expect(esquemaCambiarSala.safeParse({ turnoSegundos: malo }).success).toBe(false);
    }
  });

  it('empezar con tiempo por turno funciona, y tras un reinicio el reloj arranca completo', async () => {
    const ctx = crear();
    const a = await ctx.salas.crear('Ana');
    await ctx.salas.unirse(a.salaId, 'Beto');
    await ctx.salas.cambiar(a.salaId, a.token, { turnoSegundos: 60 });
    await ctx.salas.empezar(a.salaId, a.token, {});
    // En la preparación no hay reloj.
    expect(ctx.salas.partida(a.salaId)?.restanteMs).toBeNull();

    // Se simula que la partida ya salió de la preparación y el servidor se reinicia.
    const fila = (await ctx.repo.cargarTodas())[0]!;
    await ctx.repo.guardar({
      ...fila,
      estado: { ...fila.estado!, fase: 'PRE_TIRADA', pasoPreparacion: 4, turnoDe: 0 },
    });
    const otra = new SalasService(new PartidasService(), ctx.repo, { ahora: () => 5_000 });
    await otra.onModuleInit();
    otra.onModuleDestroy();

    expect(otra.partida(a.salaId)?.restanteMs).toBe(60_000);
    otra.partida(a.salaId)?.detener();
  });

  it('sin tiempo elegido no hay reloj', async () => {
    const ctx = crear();
    const a = await ctx.salas.crear('Ana');
    await ctx.salas.unirse(a.salaId, 'Beto');
    await ctx.salas.empezar(a.salaId, a.token, {});
    const fila = (await ctx.repo.cargarTodas())[0]!;
    await ctx.repo.guardar({ ...fila, estado: { ...fila.estado!, fase: 'PRE_TIRADA' } });

    const otra = new SalasService(new PartidasService(), ctx.repo, { ahora: () => 5_000 });
    await otra.onModuleInit();
    otra.onModuleDestroy();

    expect(otra.partida(a.salaId)?.restanteMs).toBeNull();
  });
});
