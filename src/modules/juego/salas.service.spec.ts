import { HttpException, Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepositorioSalasMemoria } from '../../infra/salas/repositorio-salas.memoria.js';
import { RepositorioSalas } from '../../infra/salas/repositorio-salas.js';
import { PartidasService } from './partidas.service.js';
import { SalasService } from './salas.service.js';

afterEach(() => vi.restoreAllMocks());

const HORA_MS = 60 * 60 * 1000;

function crear(opciones: { limiteSalas?: number; limitePartidas?: number } = {}) {
  let ahora = 1_000;
  const repo = new RepositorioSalasMemoria();
  const partidas = new PartidasService(opciones.limitePartidas);
  const salas = new SalasService(partidas, repo, {
    ahora: () => ahora,
    limiteSalas: opciones.limiteSalas,
  });
  return {
    repo,
    partidas,
    salas,
    avanzar: (ms: number) => {
      ahora += ms;
    },
  };
}

const falla = async (promesa: Promise<unknown>): Promise<number> => {
  try {
    await promesa;
  } catch (e) {
    return (e as HttpException).getStatus();
  }
  throw new Error('no falló');
};

describe('SalasService: crear y unirse', () => {
  it('crear devuelve el id de sala, el jugador anfitrión y un token en claro', async () => {
    const { salas } = crear();
    const r = await salas.crear('Ana');
    expect(r.salaId).toMatch(/^[0-9a-f]{8}$/);
    expect(r.jugadorId).toBe('j1');
    expect(r.token.length).toBeGreaterThanOrEqual(30);
    expect(salas.estado(r.salaId)).toEqual({
      id: r.salaId,
      empezada: false,
      anfitrion: 'j1',
      jugadores: [{ id: 'j1', nombre: 'Ana' }],
    });
  });

  it('el estado público nunca incluye tokens ni hashes', async () => {
    const { salas } = crear();
    const { salaId, token } = await salas.crear('Ana');
    const json = JSON.stringify(salas.estado(salaId));
    expect(json).not.toContain(token);
    expect(json).not.toMatch(/hash/i);
  });

  it('unirse añade jugadores con ids consecutivos y tokens distintos', async () => {
    const { salas } = crear();
    const a = await salas.crear('Ana');
    const b = await salas.unirse(a.salaId, 'Beto');
    expect(b.jugadorId).toBe('j2');
    expect(b.token).not.toBe(a.token);
    expect(salas.estado(a.salaId).jugadores.map((j) => j.nombre)).toEqual(['Ana', 'Beto']);
  });

  it('unirse a una sala inexistente da 404', async () => {
    expect(await falla(crear().salas.unirse('00000000', 'Ana'))).toBe(404);
  });

  it('no deja pasar de 10 jugadores (409)', async () => {
    const { salas } = crear();
    const { salaId } = await salas.crear('J1');
    for (let i = 2; i <= 10; i++) await salas.unirse(salaId, `J${i}`); // eslint-disable-line no-await-in-loop
    expect(await falla(salas.unirse(salaId, 'Extra'))).toBe(409);
  });

  it('no deja unirse a una sala que ya empezó (409)', async () => {
    const { salas } = crear();
    const a = await salas.crear('Ana');
    await salas.unirse(a.salaId, 'Beto');
    await salas.empezar(a.salaId, a.token, {});
    expect(await falla(salas.unirse(a.salaId, 'Tarde'))).toBe(409);
  });

  it('tiene un tope de salas (503)', async () => {
    const { salas } = crear({ limiteSalas: 1 });
    await salas.crear('Ana');
    expect(await falla(salas.crear('Beto'))).toBe(503);
  });

  it('estado de una sala inexistente da 404', () => {
    expect(() => crear().salas.estado('nada')).toThrow(HttpException);
  });
});

describe('SalasService: autenticar', () => {
  it('reconoce al jugador por su token', async () => {
    const { salas } = crear();
    const a = await salas.crear('Ana');
    const b = await salas.unirse(a.salaId, 'Beto');
    expect(salas.autenticar(a.salaId, a.token)).toBe('j1');
    expect(salas.autenticar(a.salaId, b.token)).toBe('j2');
  });

  it('rechaza tokens falsos, vacíos, de otra sala o de una sala inexistente', async () => {
    const { salas } = crear();
    const a = await salas.crear('Ana');
    const otra = await salas.crear('Otra');
    expect(salas.autenticar(a.salaId, 'falso')).toBeUndefined();
    expect(salas.autenticar(a.salaId, '')).toBeUndefined();
    expect(salas.autenticar(a.salaId, otra.token)).toBeUndefined();
    expect(salas.autenticar('00000000', a.token)).toBeUndefined();
  });
});

describe('SalasService: empezar', () => {
  it('crea la partida con los jugadores de la sala y la deja accesible', async () => {
    const { salas, partidas } = crear();
    const a = await salas.crear('Ana');
    await salas.unirse(a.salaId, 'Beto');
    await salas.empezar(a.salaId, a.token, { puntosVictoria: 6 });
    expect(salas.estado(a.salaId).empezada).toBe(true);
    const actor = salas.partida(a.salaId);
    expect(actor).toBeDefined();
    expect(actor?.estado.jugadores.map((j) => j.id).toSorted()).toEqual(['j1', 'j2']);
    expect(actor?.estado.config.puntosVictoria).toBe(6);
    expect(partidas.cantidad).toBe(1);
  });

  it('exige token válido (401), al menos 2 jugadores (409) y ser anfitrión (403)', async () => {
    const { salas } = crear();
    const a = await salas.crear('Ana');
    expect(await falla(salas.empezar(a.salaId, 'falso', {}))).toBe(401);
    expect(await falla(salas.empezar(a.salaId, a.token, {}))).toBe(409);
    const b = await salas.unirse(a.salaId, 'Beto');
    expect(await falla(salas.empezar(a.salaId, b.token, {}))).toBe(403);
  });

  it('no se puede empezar dos veces (409)', async () => {
    const { salas } = crear();
    const a = await salas.crear('Ana');
    await salas.unirse(a.salaId, 'Beto');
    await salas.empezar(a.salaId, a.token, {});
    expect(await falla(salas.empezar(a.salaId, a.token, {}))).toBe(409);
  });

  it('si no caben más partidas vivas responde 503 y la sala sigue en espera', async () => {
    const { salas } = crear({ limitePartidas: 0 });
    const a = await salas.crear('Ana');
    await salas.unirse(a.salaId, 'Beto');
    expect(await falla(salas.empezar(a.salaId, a.token, {}))).toBe(503);
    expect(salas.estado(a.salaId).empezada).toBe(false);
  });
});

describe('SalasService: persistencia', () => {
  it('guarda la sala al crearla, al unirse y al empezar', async () => {
    const { salas, repo } = crear();
    const a = await salas.crear('Ana');
    expect((await repo.cargarTodas())[0]?.jugadores).toHaveLength(1);
    await salas.unirse(a.salaId, 'Beto');
    expect((await repo.cargarTodas())[0]?.jugadores).toHaveLength(2);
    await salas.empezar(a.salaId, a.token, {});
    const guardada = (await repo.cargarTodas())[0];
    expect(guardada?.partidaId).not.toBeNull();
    expect(guardada?.estado?.version).toBe(0);
  });

  it('guarda el estado tras cada jugada aceptada', async () => {
    const { salas, repo } = crear();
    const a = await salas.crear('Ana');
    await salas.unirse(a.salaId, 'Beto');
    await salas.empezar(a.salaId, a.token, {});
    const actor = salas.partida(a.salaId)!;
    const turno = actor.estado.jugadores[actor.estado.turnoDe]!.id;
    const vertice = actor.mesaPublica.vertices[0]!.id;
    const r = await actor.enviar({ tipo: 'COLOCAR_POBLADO_INICIAL', jugador: turno, vertice });
    expect(r.ok).toBe(true);
    await new Promise((resolver) => setImmediate(resolver));
    expect((await repo.cargarTodas())[0]?.estado?.version).toBe(actor.estado.version);
  });

  it('nunca guarda tokens en claro', async () => {
    const { salas, repo } = crear();
    const a = await salas.crear('Ana');
    expect(JSON.stringify(await repo.cargarTodas())).not.toContain(a.token);
  });

  it('al arrancar restaura salas y partidas guardadas, con los mismos tokens', async () => {
    const uno = crear();
    const a = await uno.salas.crear('Ana');
    const b = await uno.salas.unirse(a.salaId, 'Beto');
    await uno.salas.empezar(a.salaId, a.token, {});
    const antes = uno.salas.partida(a.salaId)!.estado;

    const partidas2 = new PartidasService();
    const salas2 = new SalasService(partidas2, uno.repo);
    await salas2.onModuleInit();
    salas2.onModuleDestroy();

    expect(salas2.estado(a.salaId).empezada).toBe(true);
    expect(salas2.autenticar(a.salaId, b.token)).toBe('j2');
    expect(salas2.partida(a.salaId)?.estado).toEqual(antes);
    expect(partidas2.cantidad).toBe(1);
  });

  it('restaura también las salas que aún están en espera', async () => {
    const uno = crear();
    const a = await uno.salas.crear('Ana');
    const salas2 = new SalasService(new PartidasService(), uno.repo);
    await salas2.onModuleInit();
    salas2.onModuleDestroy();
    expect(salas2.estado(a.salaId).empezada).toBe(false);
  });

  it('una sala guardada con datos corruptos se omite sin impedir el arranque', async () => {
    const uno = crear();
    const a = await uno.salas.crear('Ana');
    await uno.salas.unirse(a.salaId, 'Beto');
    await uno.salas.empezar(a.salaId, a.token, {});
    const [guardada] = await uno.repo.cargarTodas();
    await uno.repo.guardar({ ...guardada!, estado: { basura: true } as never });
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const salas2 = new SalasService(new PartidasService(), uno.repo);
    await salas2.onModuleInit();
    salas2.onModuleDestroy();
    expect(error).toHaveBeenCalled();
    expect(() => salas2.estado(a.salaId)).toThrow(HttpException);
  });

  it('si la base de datos falla al guardar, lo registra y la sala sigue funcionando', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const rota = new (class extends RepositorioSalas {
      guardar = () => Promise.reject(new Error('base caída'));
      cargarTodas = () => Promise.resolve([]);
      eliminar = () => Promise.resolve();
    })();
    const salas = new SalasService(new PartidasService(), rota);
    const a = await salas.crear('Ana');
    expect(salas.estado(a.salaId).jugadores).toHaveLength(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('base caída'), expect.anything());
  });
});

describe('SalasService: barrer', () => {
  it('quita las salas en espera abandonadas y las borra del repositorio', async () => {
    const { salas, repo, avanzar } = crear();
    const a = await salas.crear('Ana');
    avanzar(2 * HORA_MS);
    const nueva = await salas.crear('Beto');
    await salas.barrer();
    expect(() => salas.estado(a.salaId)).toThrow(HttpException);
    expect(salas.estado(nueva.salaId)).toBeDefined();
    expect((await repo.cargarTodas()).map((s) => s.id)).toEqual([nueva.salaId]);
  });

  it('quita partidas inactivas con su sala, pero no las que tienen a alguien conectado', async () => {
    let reloj = 0;
    const repo = new RepositorioSalasMemoria();
    const partidas = new PartidasService();
    const salas = new SalasService(partidas, repo, { ahora: () => reloj });
    const a = await salas.crear('Ana');
    await salas.unirse(a.salaId, 'Beto');
    await salas.empezar(a.salaId, a.token, {});
    const baja = salas.partida(a.salaId)!.suscribir('j1', () => undefined);
    reloj = 10 * HORA_MS;
    await salas.barrer();
    expect(salas.estado(a.salaId).empezada).toBe(true);
    baja();
    reloj = 20 * HORA_MS;
    await salas.barrer();
    expect(() => salas.estado(a.salaId)).toThrow(HttpException);
    expect(partidas.cantidad).toBe(0);
    expect(await repo.cargarTodas()).toEqual([]);
  });
});
