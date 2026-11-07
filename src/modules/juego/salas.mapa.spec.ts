import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { RepositorioSalasMemoria } from '../../infra/salas/repositorio-salas.memoria.js';
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

/** Una sala con `n` jugadores; devuelve el servicio, el id y el token del anfitrión. */
async function salaCon(n: number) {
  const { salas } = crear();
  const a = await salas.crear('J1');
  await Promise.all(Array.from({ length: n - 1 }, (_, i) => salas.unirse(a.salaId, `J${i + 2}`)));
  return { salas, a };
}

describe('SalasService: elegir el mapa de la sala', () => {
  it('sin mapa elegido, el máximo es el del juego (12) y no hay `mapa` en las opciones', async () => {
    const { salas } = crear();
    const a = await salas.crear('Ana');
    expect(salas.estado(a.salaId).maximo).toBe(12);
    expect(salas.estado(a.salaId).opciones).not.toHaveProperty('mapa');
  });

  it('el anfitrión elige un mapa y todos lo ven; el máximo pasa a ser el del mapa', async () => {
    const { salas } = crear();
    const a = await salas.crear('Ana');

    await salas.cambiar(a.salaId, a.token, { mapa: 'clasico' });

    expect(salas.estado(a.salaId).opciones).toMatchObject({ mapa: 'clasico' });
    expect(salas.estado(a.salaId).maximo).toBe(7); // el clásico solo admite 7 por vértices
  });

  it('volver a null deja el mapa automático', async () => {
    const { salas } = crear();
    const a = await salas.crear('Ana');
    await salas.cambiar(a.salaId, a.token, { mapa: 'clasico' });

    await salas.cambiar(a.salaId, a.token, { mapa: null });

    expect(salas.estado(a.salaId).maximo).toBe(12);
  });

  it('no deja elegir un mapa en el que no caben los jugadores que ya hay (409)', async () => {
    const { salas, a } = await salaCon(8);

    expect(await estado(salas.cambiar(a.salaId, a.token, { mapa: 'clasico' }))).toBe(409);
    expect(salas.estado(a.salaId).opciones).not.toHaveProperty('mapa'); // no se guardó
  });

  it('el mensaje dice cuántos admite el mapa y cuántos hay', async () => {
    const { salas, a } = await salaCon(8);
    await expect(salas.cambiar(a.salaId, a.token, { mapa: 'clasico' })).rejects.toThrow(
      /Clásico.*7.*8/s,
    );
  });

  it('con un mapa elegido, no entra nadie más allá de su máximo (409)', async () => {
    const { salas, a } = await salaCon(7);
    await salas.cambiar(a.salaId, a.token, { mapa: 'clasico' });

    expect(await estado(salas.unirse(a.salaId, 'Octavo'))).toBe(409);
  });

  it('un mapa desconocido que llegó a la sala (el catálogo cambió) no deja empezar (400)', async () => {
    const { salas, a } = await salaCon(2);
    await salas.cambiar(a.salaId, a.token, {});
    // Simula una sala guardada con un id que ya no existe en el catálogo.
    expect(await estado(salas.empezar(a.salaId, a.token, { mapa: 'ya-no-existe' } as never))).toBe(
      400,
    );
  });

  it('las salas abiertas muestran el máximo del mapa elegido', async () => {
    const { salas } = crear();
    const a = await salas.crear('Ana', true);
    await salas.cambiar(a.salaId, a.token, { mapa: 'estanque' });

    expect(salas.abiertas()[0]?.maximo).toBe(11); // el estanque admite 11 por vértices
  });

  it('cambiar el mapa de una sala que ya empezó es 409', async () => {
    const { salas, a } = await salaCon(2);
    await salas.empezar(a.salaId, a.token, {});
    expect(await estado(salas.cambiar(a.salaId, a.token, { mapa: 'lagos' }))).toBe(409);
  });
});

describe('SalasService: empezar con el mapa elegido', () => {
  it('la partida usa ese mapa, con su nombre y su número de casillas', async () => {
    const { salas, a } = await salaCon(6);
    await salas.cambiar(a.salaId, a.token, { mapa: 'lagos' });

    await salas.empezar(a.salaId, a.token, {});

    const actor = salas.partida(a.salaId)!;
    expect(actor.estado.config.mapa?.nombre).toBe('Lagos');
    expect(actor.mesaPublica.casillas).toHaveLength(58);
    expect(actor.estado.config.jugadores).toBe(6);
  });

  it('el mapa de la partida es una copia de las casillas (sobrevive a cambios del catálogo)', async () => {
    const { salas, a } = await salaCon(4);
    await salas.cambiar(a.salaId, a.token, { mapa: 'diamante' });
    await salas.empezar(a.salaId, a.token, {});

    expect(salas.partida(a.salaId)!.estado.config.mapa?.casillas).toHaveLength(36);
  });

  it('lo que llega a `empezar` manda sobre lo guardado en la sala', async () => {
    const { salas, a } = await salaCon(4);
    await salas.cambiar(a.salaId, a.token, { mapa: 'lagos' });

    await salas.empezar(a.salaId, a.token, { mapa: 'diamante' });

    expect(salas.partida(a.salaId)!.estado.config.mapa?.nombre).toBe('Diamante');
  });

  it('sin mapa elegido todo sigue como antes: el hexágono por defecto, sin `mapa` en la config', async () => {
    const { salas, a } = await salaCon(4);
    await salas.empezar(a.salaId, a.token, {});

    const config = salas.partida(a.salaId)!.estado.config;
    expect(config.mapa).toBeUndefined();
    expect(config.radio).toBe(2);
  });

  it('con mapa null se usa el hexágono por defecto', async () => {
    const { salas, a } = await salaCon(4);
    await salas.cambiar(a.salaId, a.token, { mapa: 'lagos' });
    await salas.cambiar(a.salaId, a.token, { mapa: null });

    await salas.empezar(a.salaId, a.token, {});

    expect(salas.partida(a.salaId)!.estado.config.mapa).toBeUndefined();
  });

  it('cada mapa del catálogo permite empezar con el máximo de jugadores de su sala', async () => {
    const { salas } = crear();
    const llenarYEmpezar = async (id: string) => {
      const a = await salas.crear('J1');
      await salas.cambiar(a.salaId, a.token, { mapa: id });
      const maximo = salas.estado(a.salaId).maximo;
      await Promise.all(
        Array.from({ length: maximo - 1 }, (_, i) => salas.unirse(a.salaId, `P${i}`)),
      );
      await salas.empezar(a.salaId, a.token, {});
      return { maximo, jugadores: salas.partida(a.salaId)!.estado.config.jugadores };
    };

    const resultados = await Promise.all(['clasico', 'estanque', 'tierra'].map(llenarYEmpezar));

    for (const { maximo, jugadores } of resultados) expect(jugadores).toBe(maximo);
    expect(resultados.map((r) => r.maximo)).toEqual([7, 11, 12]);
  });
});
