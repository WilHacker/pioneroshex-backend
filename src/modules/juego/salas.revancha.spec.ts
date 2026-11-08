import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { RepositorioSalasMemoria } from '../../infra/salas/repositorio-salas.memoria.js';
import { PartidasService } from './partidas.service.js';
import { SalasService } from './salas.service.js';

function nuevo() {
  const salas = new SalasService(new PartidasService(), new RepositorioSalasMemoria(), {
    ahora: () => 1_000,
  });
  return { salas };
}

const codigo = async (promesa: Promise<unknown>): Promise<number> => {
  try {
    await promesa;
  } catch (e) {
    return (e as HttpException).getStatus();
  }
  throw new Error('no falló');
};

/** Ana (cuenta u-ana), Beto y Cleo en una sala con reglas propias, ya empezada. */
async function empezada() {
  const { salas } = nuevo();
  const ana = await salas.crear('Ana', false, 'u-ana', {
    puntosVictoria: 12,
    ladronAmistoso: true,
  });
  const beto = await salas.unirse(ana.salaId, 'Beto');
  const cleo = await salas.unirse(ana.salaId, 'Cleo');
  await salas.empezar(ana.salaId, ana.token, {});
  return { salas, id: ana.salaId, ana, beto, cleo };
}

/** Termina la partida: Beto y Cleo abandonan, gana Ana. */
async function terminar(salas: SalasService, id: string, ...abandonan: string[]): Promise<void> {
  const actor = salas.partida(id)!;
  for (const jugador of abandonan) await actor.enviar({ tipo: 'ABANDONAR', jugador });
}

describe('SalasService.revancha', () => {
  it('no se puede pedir mientras la partida sigue en juego', async () => {
    const { salas, id, beto } = await empezada();
    expect(await codigo(salas.revancha(id, beto.token))).toBe(409);
  });

  it('exige un token válido de esa sala', async () => {
    const { salas, id } = await empezada();
    await terminar(salas, id, 'j2', 'j3');
    expect(await codigo(salas.revancha(id, 'inventado'))).toBe(401);
  });

  it('el primero en pedirla crea una sala nueva con las mismas reglas y es su anfitrión', async () => {
    const { salas, id, beto } = await empezada();
    await terminar(salas, id, 'j2', 'j3');
    const nueva = await salas.revancha(id, beto.token);
    expect(nueva.salaId).not.toBe(id);
    const estado = salas.estado(nueva.salaId);
    expect(estado.empezada).toBe(false);
    expect(estado.anfitrion).toBe(nueva.jugadorId);
    expect(estado.jugadores.map((j) => j.nombre)).toEqual(['Beto']);
    expect(estado.opciones).toMatchObject({ puntosVictoria: 12, ladronAmistoso: true });
    expect(estado.publica).toBe(false);
  });

  it('los demás que la piden entran a esa misma sala, con su propio nombre', async () => {
    const { salas, id, ana, beto, cleo } = await empezada();
    await terminar(salas, id, 'j2', 'j3');
    const deBeto = await salas.revancha(id, beto.token);
    const deAna = await salas.revancha(id, ana.token);
    const deCleo = await salas.revancha(id, cleo.token);
    expect(deAna.salaId).toBe(deBeto.salaId);
    expect(deCleo.salaId).toBe(deBeto.salaId);
    expect(salas.estado(deBeto.salaId).jugadores.map((j) => j.nombre)).toEqual([
      'Beto',
      'Ana',
      'Cleo',
    ]);
    expect(salas.autenticar(deBeto.salaId, deAna.token)).toBe(deAna.jugadorId);
  });

  it('pedirla dos veces no duplica al jugador: recupera su asiento con un token nuevo', async () => {
    const { salas, id, beto } = await empezada();
    await terminar(salas, id, 'j2', 'j3');
    const primera = await salas.revancha(id, beto.token);
    const segunda = await salas.revancha(id, beto.token);
    expect(segunda.salaId).toBe(primera.salaId);
    expect(segunda.jugadorId).toBe(primera.jugadorId);
    expect(segunda.token).not.toBe(primera.token);
    expect(salas.autenticar(primera.salaId, primera.token)).toBeUndefined();
    expect(salas.estado(primera.salaId).jugadores).toHaveLength(1);
  });

  it('la cuenta se conserva en la sala nueva (no puede sentarse dos veces)', async () => {
    const { salas, id, ana } = await empezada();
    await terminar(salas, id, 'j2', 'j3');
    const nueva = await salas.revancha(id, ana.token);
    const otra = await salas.unirse(nueva.salaId, 'Ana otra vez', 'u-ana');
    expect(otra.jugadorId).toBe(nueva.jugadorId);
  });

  it('si la sala nueva se vació, la siguiente petición crea otra', async () => {
    const { salas, id, beto, cleo } = await empezada();
    await terminar(salas, id, 'j2', 'j3');
    const primera = await salas.revancha(id, beto.token);
    await salas.salir(primera.salaId, primera.token);
    const segunda = await salas.revancha(id, cleo.token);
    expect(segunda.salaId).not.toBe(primera.salaId);
    expect(salas.estado(segunda.salaId).jugadores.map((j) => j.nombre)).toEqual(['Cleo']);
  });

  it('si la sala nueva ya empezó, quien llega tarde recibe 409', async () => {
    const { salas, id, ana, beto, cleo } = await empezada();
    await terminar(salas, id, 'j2', 'j3');
    const deBeto = await salas.revancha(id, beto.token);
    await salas.revancha(id, ana.token);
    await salas.empezar(deBeto.salaId, deBeto.token, {});
    expect(await codigo(salas.revancha(id, cleo.token))).toBe(409);
  });
});
