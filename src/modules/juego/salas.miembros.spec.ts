import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { RepositorioSalasMemoria } from '../../infra/salas/repositorio-salas.memoria.js';
import { PartidasService } from './partidas.service.js';
import { SalasService } from './salas.service.js';

function nuevo() {
  const repo = new RepositorioSalasMemoria();
  const salas = new SalasService(new PartidasService(), repo, { ahora: () => 1_000 });
  return { repo, salas };
}

const codigo = async (promesa: Promise<unknown>): Promise<number> => {
  try {
    await promesa;
  } catch (e) {
    return (e as HttpException).getStatus();
  }
  throw new Error('no falló');
};

/** Una sala con Ana (anfitriona), Beto y Cleo. */
async function conTres() {
  const ctx = nuevo();
  const ana = await ctx.salas.crear('Ana');
  const beto = await ctx.salas.unirse(ana.salaId, 'Beto');
  const cleo = await ctx.salas.unirse(ana.salaId, 'Cleo');
  return { ...ctx, id: ana.salaId, ana, beto, cleo };
}

const nombres = (salas: SalasService, id: string) =>
  salas.estado(id).jugadores.map((j) => j.nombre);

describe('SalasService.salir', () => {
  it('quita al jugador de la sala y su token deja de valer', async () => {
    const { salas, id, beto } = await conTres();
    await salas.salir(id, beto.token);
    expect(nombres(salas, id)).toEqual(['Ana', 'Cleo']);
    expect(salas.autenticar(id, beto.token)).toBeUndefined();
  });

  it('si sale el anfitrión, lo pasa al jugador que lleva más tiempo en la sala', async () => {
    const { salas, id, ana } = await conTres();
    await salas.salir(id, ana.token);
    expect(salas.estado(id).anfitrion).toBe('j2');
    expect(nombres(salas, id)).toEqual(['Beto', 'Cleo']);
  });

  it('si sale el último, la sala desaparece también del repositorio', async () => {
    const { salas, repo } = nuevo();
    const ana = await salas.crear('Ana');
    await salas.salir(ana.salaId, ana.token);
    expect(() => salas.estado(ana.salaId)).toThrow(HttpException);
    expect(await repo.cargarTodas()).toEqual([]);
    expect(salas.resumen().salasAbiertas).toBe(0);
  });

  it('se guarda en el repositorio', async () => {
    const { salas, repo, id, beto } = await conTres();
    await salas.salir(id, beto.token);
    expect((await repo.cargarTodas())[0]?.jugadores.map((j) => j.nombre)).toEqual(['Ana', 'Cleo']);
  });

  it('con un token que no es de nadie da 401', async () => {
    const { salas, id } = await conTres();
    expect(await codigo(salas.salir(id, 'falso'))).toBe(401);
    expect(await codigo(salas.salir(id, ''))).toBe(401);
  });

  it('en una sala que no existe da 404', async () => {
    const { salas } = nuevo();
    expect(await codigo(salas.salir('00000000', 'x'))).toBe(404);
  });

  it('con la partida empezada no se puede salir de la sala (409)', async () => {
    const { salas, id, ana, beto } = await conTres();
    await salas.empezar(id, ana.token, {});
    expect(await codigo(salas.salir(id, beto.token))).toBe(409);
  });

  it('quien sale puede volver a entrar con su cuenta', async () => {
    const { salas } = nuevo();
    const ana = await salas.crear('Ana');
    const beto = await salas.unirse(ana.salaId, 'Beto', 'u-beto');
    await salas.salir(ana.salaId, beto.token);
    await expect(salas.unirse(ana.salaId, 'Beto', 'u-beto')).resolves.toBeDefined();
  });
});

describe('SalasService: ids de jugador tras salidas', () => {
  it('quien entra después de una salida no repite un id que ya existe', async () => {
    const { salas, id, beto } = await conTres(); // j1, j2, j3
    await salas.salir(id, beto.token); // sale j2
    const dani = await salas.unirse(id, 'Dani');
    const ids = salas.estado(id).jugadores.map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(dani.jugadorId).toBe('j4');
  });

  it('si sale el que tenía el id más alto, el siguiente tampoco choca con nadie', async () => {
    const { salas, id, cleo } = await conTres();
    await salas.salir(id, cleo.token);
    const dani = await salas.unirse(id, 'Dani');
    expect(salas.estado(id).jugadores.map((j) => j.id)).toEqual(['j1', 'j2', dani.jugadorId]);
    expect(dani.jugadorId).not.toBe('j2');
  });

  it('la partida puede empezar con ids que ya no son consecutivos', async () => {
    const { salas, id, ana, beto } = await conTres();
    await salas.salir(id, beto.token);
    await salas.empezar(id, ana.token, {});
    expect(
      salas
        .partida(id)
        ?.estado.jugadores.map((j) => j.id)
        .toSorted(),
    ).toEqual(['j1', 'j3']);
  });
});

describe('SalasService.expulsar', () => {
  it('el anfitrión saca a otro jugador y el token del expulsado deja de valer', async () => {
    const { salas, id, ana, beto } = await conTres();
    await salas.expulsar(id, ana.token, 'j2');
    expect(nombres(salas, id)).toEqual(['Ana', 'Cleo']);
    expect(salas.autenticar(id, beto.token)).toBeUndefined();
  });

  it('solo el anfitrión puede (403) y hace falta un token válido (401)', async () => {
    const { salas, id, beto } = await conTres();
    expect(await codigo(salas.expulsar(id, beto.token, 'j3'))).toBe(403);
    expect(await codigo(salas.expulsar(id, 'falso', 'j3'))).toBe(401);
    expect(nombres(salas, id)).toEqual(['Ana', 'Beto', 'Cleo']);
  });

  it('no puede expulsarse a sí mismo (409): para eso está salir', async () => {
    const { salas, id, ana } = await conTres();
    expect(await codigo(salas.expulsar(id, ana.token, 'j1'))).toBe(409);
  });

  it('un jugador que no está en la sala da 404', async () => {
    const { salas, id, ana } = await conTres();
    expect(await codigo(salas.expulsar(id, ana.token, 'j9'))).toBe(404);
  });

  it('con la partida empezada no se puede expulsar (409)', async () => {
    const { salas, id, ana } = await conTres();
    await salas.empezar(id, ana.token, {});
    expect(await codigo(salas.expulsar(id, ana.token, 'j2'))).toBe(409);
  });

  it('el sitio queda libre para otro', async () => {
    const { salas } = nuevo();
    const ana = await salas.crear('Ana', false, undefined, { maxJugadores: 2 });
    await salas.unirse(ana.salaId, 'Beto');
    await salas.expulsar(ana.salaId, ana.token, 'j2');
    await expect(salas.unirse(ana.salaId, 'Cleo')).resolves.toBeDefined();
  });
});

describe('SalasService.cederAnfitrion', () => {
  it('el anfitrión se lo pasa a otro jugador', async () => {
    const { salas, id, ana, beto } = await conTres();
    await salas.cederAnfitrion(id, ana.token, 'j2');
    expect(salas.estado(id).anfitrion).toBe('j2');
    // Ahora Ana ya no manda y Beto sí.
    expect(await codigo(salas.cambiar(id, ana.token, { publica: true }))).toBe(403);
    await expect(salas.cambiar(id, beto.token, { publica: true })).resolves.toBeUndefined();
  });

  it('solo el anfitrión puede (403)', async () => {
    const { salas, id, beto } = await conTres();
    expect(await codigo(salas.cederAnfitrion(id, beto.token, 'j3'))).toBe(403);
  });

  it('no se puede ceder a uno mismo (409) ni a quien no está (404)', async () => {
    const { salas, id, ana } = await conTres();
    expect(await codigo(salas.cederAnfitrion(id, ana.token, 'j1'))).toBe(409);
    expect(await codigo(salas.cederAnfitrion(id, ana.token, 'j9'))).toBe(404);
  });

  it('con la partida empezada no se puede (409)', async () => {
    const { salas, id, ana } = await conTres();
    await salas.empezar(id, ana.token, {});
    expect(await codigo(salas.cederAnfitrion(id, ana.token, 'j2'))).toBe(409);
  });
});

describe('SalasService.unirse: un nombre por sala', () => {
  it('rechaza (409) entrar con el nombre de alguien que ya está en la sala', async () => {
    const { salas, id } = await conTres();
    expect(await codigo(salas.unirse(id, 'Beto'))).toBe(409);
    expect(nombres(salas, id)).toEqual(['Ana', 'Beto', 'Cleo']);
  });

  it('ignora mayúsculas, tildes de composición y espacios sobrantes', async () => {
    const { salas, id } = await conTres();
    expect(await codigo(salas.unirse(id, '  bETO '))).toBe(409);
    expect(await codigo(salas.unirse(id, 'ana'))).toBe(409);
  });

  it('el anfitrión también cuenta', async () => {
    const { salas, id } = await conTres();
    expect(await codigo(salas.unirse(id, 'Ana'))).toBe(409);
  });

  it('el nombre queda libre cuando esa persona sale', async () => {
    const { salas, id, beto } = await conTres();
    await salas.salir(id, beto.token);
    await salas.unirse(id, 'Beto');
    expect(nombres(salas, id)).toEqual(['Ana', 'Cleo', 'Beto']);
  });

  it('el mismo nombre en otra sala es válido', async () => {
    const { salas } = await conTres();
    const otra = await salas.crear('Beto');
    expect(salas.estado(otra.salaId).jugadores.map((j) => j.nombre)).toEqual(['Beto']);
  });
});
