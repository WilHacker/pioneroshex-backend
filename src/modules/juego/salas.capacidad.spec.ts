import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { RepositorioSalasMemoria } from '../../infra/salas/repositorio-salas.memoria.js';
import { esquemaCambiarSala, esquemaCrearSala } from '../../schemas/salas.js';
import { PartidasService } from './partidas.service.js';
import { SalasService } from './salas.service.js';

const nuevo = () =>
  new SalasService(new PartidasService(), new RepositorioSalasMemoria(), { ahora: () => 1_000 });

const codigo = async (promesa: Promise<unknown>): Promise<number> => {
  try {
    await promesa;
  } catch (e) {
    return (e as HttpException).getStatus();
  }
  throw new Error('no falló');
};

describe('esquemas: maxJugadores y reglas al crear', () => {
  it('crear acepta el tope y las reglas, y todo es opcional', () => {
    expect(esquemaCrearSala.safeParse({ nombre: 'Ana' }).success).toBe(true);
    expect(
      esquemaCrearSala.parse({ nombre: 'Ana', maxJugadores: 6, puntosVictoria: 12, publica: true }),
    ).toEqual({ nombre: 'Ana', maxJugadores: 6, puntosVictoria: 12, publica: true });
  });

  it.each([1, 13, 2.5, '6', null])('rechaza maxJugadores %j', (maxJugadores) => {
    expect(esquemaCrearSala.safeParse({ nombre: 'Ana', maxJugadores }).success).toBe(false);
    expect(esquemaCambiarSala.safeParse({ maxJugadores }).success).toBe(false);
  });

  it('sigue rechazando campos desconocidos', () => {
    expect(esquemaCrearSala.safeParse({ nombre: 'Ana', semillaAzar: 'x' }).success).toBe(false);
  });
});

describe('SalasService: cuántos jugadores admite la sala', () => {
  it('sin tope elegido admite el máximo del juego', async () => {
    const salas = nuevo();
    const a = await salas.crear('Ana');
    expect(salas.estado(a.salaId).maximo).toBe(12);
  });

  it('se crea ya con el tope y las reglas que eligió el anfitrión', async () => {
    const salas = nuevo();
    const a = await salas.crear('Ana', true, undefined, { maxJugadores: 4, puntosVictoria: 12 });
    expect(salas.estado(a.salaId)).toMatchObject({
      publica: true,
      maximo: 4,
      opciones: { maxJugadores: 4, puntosVictoria: 12 },
    });
    expect(salas.abiertas()[0]).toMatchObject({ jugadores: 1, maximo: 4 });
  });

  it('no deja entrar a más jugadores que el tope (409)', async () => {
    const salas = nuevo();
    const a = await salas.crear('Ana', false, undefined, { maxJugadores: 2 });
    await salas.unirse(a.salaId, 'Beto');
    expect(await codigo(salas.unirse(a.salaId, 'Cleo'))).toBe(409);
    expect(salas.estado(a.salaId).jugadores).toHaveLength(2);
  });

  it('el anfitrión cambia el tope mientras espera', async () => {
    const salas = nuevo();
    const a = await salas.crear('Ana', false, undefined, { maxJugadores: 2 });
    await salas.cambiar(a.salaId, a.token, { maxJugadores: 5 });
    expect(salas.estado(a.salaId).maximo).toBe(5);
    await salas.unirse(a.salaId, 'Beto');
    await salas.unirse(a.salaId, 'Cleo');
    expect(salas.estado(a.salaId).jugadores).toHaveLength(3);
  });

  it('no deja bajar el tope por debajo de los jugadores que ya están (409)', async () => {
    const salas = nuevo();
    const a = await salas.crear('Ana');
    await salas.unirse(a.salaId, 'Beto');
    await salas.unirse(a.salaId, 'Cleo');
    expect(await codigo(salas.cambiar(a.salaId, a.token, { maxJugadores: 2 }))).toBe(409);
    expect(salas.estado(a.salaId).maximo).toBe(12);
    await salas.cambiar(a.salaId, a.token, { maxJugadores: 3 });
    expect(salas.estado(a.salaId).maximo).toBe(3);
  });

  it('si el mapa admite menos que el tope, manda el mapa', async () => {
    const salas = nuevo();
    const a = await salas.crear('Ana', false, undefined, { maxJugadores: 12, mapa: 'clasico' });
    const { maximo } = salas.estado(a.salaId);
    expect(maximo).toBeLessThanOrEqual(12);
    await salas.cambiar(a.salaId, a.token, { maxJugadores: 2 });
    expect(salas.estado(a.salaId).maximo).toBe(2);
  });

  it('crear con un mapa que no existe falla (400) y no deja una sala a medias', async () => {
    const salas = nuevo();
    expect(await codigo(salas.crear('Ana', false, undefined, { mapa: 'no-existe' }))).toBe(400);
    expect(salas.resumen().salasAbiertas).toBe(0);
  });

  it('con un tope de 3 la partida empieza con los que haya (2) sin quejarse del tope', async () => {
    const salas = nuevo();
    const a = await salas.crear('Ana', false, undefined, { maxJugadores: 3 });
    await salas.unirse(a.salaId, 'Beto');
    await salas.empezar(a.salaId, a.token, {});
    expect(salas.partida(a.salaId)?.estado.config.jugadores).toBe(2);
  });
});
