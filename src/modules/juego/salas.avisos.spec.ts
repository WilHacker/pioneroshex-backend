import { describe, expect, it } from 'vitest';
import { RepositorioSalasMemoria } from '../../infra/salas/repositorio-salas.memoria.js';
import { PartidasService } from './partidas.service.js';
import { SalasService } from './salas.service.js';

function nuevo() {
  const salas = new SalasService(new PartidasService(), new RepositorioSalasMemoria(), {
    ahora: () => 1_000,
  });
  const avisos: string[] = [];
  const baja = salas.alCambiar((id) => avisos.push(id));
  return { salas, avisos, baja };
}

describe('SalasService.alCambiar', () => {
  it('avisa al crear, unirse, cambiar y ceder el cargo', async () => {
    const { salas, avisos } = nuevo();
    const ana = await salas.crear('Ana');
    await salas.unirse(ana.salaId, 'Beto');
    await salas.cambiar(ana.salaId, ana.token, { publica: true });
    await salas.cederAnfitrion(ana.salaId, ana.token, 'j2');
    expect(avisos).toEqual(Array(4).fill(ana.salaId));
  });

  it('avisa al salir y al expulsar, también cuando la sala se queda vacía', async () => {
    const { salas, avisos } = nuevo();
    const ana = await salas.crear('Ana');
    const beto = await salas.unirse(ana.salaId, 'Beto');
    avisos.length = 0;
    await salas.expulsar(ana.salaId, ana.token, beto.jugadorId);
    await salas.salir(ana.salaId, ana.token);
    expect(avisos).toEqual([ana.salaId, ana.salaId]);
    expect(() => salas.estado(ana.salaId)).toThrow();
  });

  it('el aviso llega cuando el estado ya es el nuevo', async () => {
    const { salas } = nuevo();
    const ana = await salas.crear('Ana');
    const vistos: number[] = [];
    salas.alCambiar((id) => vistos.push(salas.estado(id).jugadores.length));
    await salas.unirse(ana.salaId, 'Beto');
    expect(vistos).toEqual([2]);
  });

  it('dar de baja la escucha deja de avisar', async () => {
    const { salas, avisos, baja } = nuevo();
    const ana = await salas.crear('Ana');
    baja();
    await salas.unirse(ana.salaId, 'Beto');
    expect(avisos).toEqual([ana.salaId]);
  });

  it('una escucha que falla no impide el cambio ni a las demás', async () => {
    const { salas, avisos } = nuevo();
    salas.alCambiar(() => {
      throw new Error('cliente roto');
    });
    const ana = await salas.crear('Ana');
    expect(avisos).toEqual([ana.salaId]);
  });
});

describe('SalasService.unirse con cuenta', () => {
  it('la misma cuenta que vuelve recupera su asiento con un token nuevo y el viejo deja de valer', async () => {
    const { salas } = nuevo();
    const ana = await salas.crear('Ana', false, 'u-ana');
    const beto = await salas.unirse(ana.salaId, 'Beto', 'u-beto');
    const otra = await salas.unirse(ana.salaId, 'Beto', 'u-beto');
    expect(otra.jugadorId).toBe(beto.jugadorId);
    expect(otra.token).not.toBe(beto.token);
    expect(salas.autenticar(ana.salaId, beto.token)).toBeUndefined();
    expect(salas.autenticar(ana.salaId, otra.token)).toBe(beto.jugadorId);
    expect(salas.estado(ana.salaId).jugadores).toHaveLength(2);
  });

  it('un invitado no puede quedarse con el nombre de una cuenta', async () => {
    const { salas } = nuevo();
    const ana = await salas.crear('Ana', false, 'u-ana');
    await expect(salas.unirse(ana.salaId, 'Ana')).rejects.toThrow('Ya hay alguien con ese nombre');
  });
});

describe('SalasService.unirse con cuenta en una sala llena', () => {
  it('quien ya estaba dentro recupera su asiento aunque no quepa nadie más', async () => {
    const { salas } = nuevo();
    const ana = await salas.crear('Ana', false, 'u-ana');
    await salas.cambiar(ana.salaId, ana.token, { maxJugadores: 2 });
    await salas.unirse(ana.salaId, 'Beto', 'u-beto');
    const otra = await salas.unirse(ana.salaId, 'Ana', 'u-ana');
    expect(otra.jugadorId).toBe(ana.jugadorId);
    await expect(salas.unirse(ana.salaId, 'Cleo', 'u-cleo')).rejects.toThrow('llena');
  });
});
