import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearPartida } from '../../core/estado/crear.js';
import { mesaPublica } from '../../core/estado/mesa-publica.js';
import type { Notificacion } from '../../core/estado/paso.js';
import { conCambios, mesaDePrueba } from '../../core/estado/pruebas.js';
import type { Accion } from '../../core/estado/tipos.js';
import { vistaPara } from '../../core/estado/vista.js';
import { PartidaActor } from './partida-actor.js';

const mesa = mesaDePrueba({ jugadores: 3 });
const inicial = crearPartida(mesa, ['a', 'b', 'c']);
const [a, b, c] = inicial.jugadores.map((j) => j.id) as [string, string, string];
const preTirada = conCambios(inicial, { fase: 'PRE_TIRADA', pasoPreparacion: 6, turnoDe: 0 });
const tirar: Accion = { tipo: 'TIRAR_DADOS', jugador: a };
const terminar: Accion = { tipo: 'TERMINAR_TURNO', jugador: a };

afterEach(() => vi.restoreAllMocks());

describe('PartidaActor: una acción a la vez', () => {
  it('aplica las acciones en el orden en que se envían, aunque lleguen juntas', async () => {
    const actor = new PartidaActor(mesa, preTirada);
    const [r1, r2] = await Promise.all([actor.enviar(tirar), actor.enviar(terminar)]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(actor.estado.fase).toBe('PRE_TIRADA');
    expect(actor.estado.turnoDe).toBe(1);
  });

  it('si llegan al revés, la primera se rechaza y la segunda ve el estado ya cambiado', async () => {
    const actor = new PartidaActor(mesa, preTirada);
    const [r1, r2] = await Promise.all([actor.enviar(terminar), actor.enviar(tirar)]);
    expect(r1).toEqual({ ok: false, motivo: 'FASE_INCORRECTA' });
    expect(r2.ok).toBe(true);
    expect(actor.estado.fase).toBe('FASE_PRINCIPAL');
  });

  it('una jugada rechazada no cambia el estado', async () => {
    const actor = new PartidaActor(mesa, preTirada);
    const antes = actor.estado;
    await actor.enviar({ tipo: 'TIRAR_DADOS', jugador: b });
    expect(actor.estado).toBe(antes);
  });

  it('devuelve el estado nuevo y los eventos completos al que envía', async () => {
    const actor = new PartidaActor(mesa, preTirada);
    const r = await actor.enviar(tirar);
    if (!r.ok) throw new Error(r.motivo);
    expect(r.estado).toBe(actor.estado);
    expect(r.eventosCompletos[0]).toMatchObject({ tipo: 'DADOS_TIRADOS', jugador: a });
  });

  it('un error inesperado rechaza esa promesa pero no bloquea las acciones siguientes', async () => {
    const actor = new PartidaActor(mesa, preTirada);
    const explosiva = {
      tipo: 'TIRAR_DADOS',
      get jugador(): string {
        throw new Error('fallo inesperado');
      },
    } as unknown as Accion;
    const fallo = actor.enviar(explosiva);
    const siguiente = actor.enviar(tirar);
    await expect(fallo).rejects.toThrow('fallo inesperado');
    await expect(siguiente).resolves.toMatchObject({ ok: true });
  });
});

describe('PartidaActor: suscriptores', () => {
  it('cada suscriptor recibe su notificación, filtrada para él', async () => {
    const actor = new PartidaActor(mesa, preTirada);
    const recibidas: Record<string, Notificacion[]> = { a: [], b: [], espectador: [] };
    actor.suscribir(a, (n) => recibidas.a!.push(n));
    actor.suscribir(b, (n) => recibidas.b!.push(n));
    actor.suscribir(null, (n) => recibidas.espectador!.push(n));
    await actor.enviar(tirar);
    for (const [clave, observador] of [
      ['a', a],
      ['b', b],
      ['espectador', null],
    ] as const) {
      expect(recibidas[clave]).toHaveLength(1);
      expect(recibidas[clave]![0]!.observador).toBe(observador);
      expect(recibidas[clave]![0]!.vista).toEqual(vistaPara(actor.estado, observador));
    }
    expect(recibidas.b![0]!.vista.jugadores.find((j) => j.id === a)!.recursos).toBeNull();
  });

  it('varias conexiones del mismo jugador reciben todas la notificación', async () => {
    const actor = new PartidaActor(mesa, preTirada);
    const pestana1 = vi.fn();
    const pestana2 = vi.fn();
    actor.suscribir(a, pestana1);
    actor.suscribir(a, pestana2);
    await actor.enviar(tirar);
    expect(pestana1).toHaveBeenCalledTimes(1);
    expect(pestana2).toHaveBeenCalledTimes(1);
  });

  it('quien se da de baja deja de recibir; las demás conexiones del mismo jugador siguen', async () => {
    const actor = new PartidaActor(mesa, preTirada);
    const sale = vi.fn();
    const sigue = vi.fn();
    const baja = actor.suscribir(a, sale);
    actor.suscribir(a, sigue);
    baja();
    baja(); // darse de baja dos veces no hace daño
    await actor.enviar(tirar);
    expect(sale).not.toHaveBeenCalled();
    expect(sigue).toHaveBeenCalledTimes(1);
  });

  it('una jugada rechazada no notifica a nadie', async () => {
    const actor = new PartidaActor(mesa, preTirada);
    const escucha = vi.fn();
    actor.suscribir(a, escucha);
    await actor.enviar(terminar);
    expect(escucha).not.toHaveBeenCalled();
  });

  it('un suscriptor que falla no afecta a los demás ni al estado, y el error se registra', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const actor = new PartidaActor(mesa, preTirada);
    const sano = vi.fn();
    actor.suscribir(a, () => {
      throw new Error('socket roto');
    });
    actor.suscribir(b, sano);
    const r = await actor.enviar(tirar);
    expect(r.ok).toBe(true);
    expect(sano).toHaveBeenCalledTimes(1);
    expect(actor.estado.fase).toBe('FASE_PRINCIPAL');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('socket roto'), expect.any(String));
  });

  it('suscribir a un jugador que no participa es un error de programación: lanza', () => {
    const actor = new PartidaActor(mesa, preTirada);
    expect(() => actor.suscribir('fantasma', vi.fn())).toThrow(/fantasma/);
  });

  it('solo calcula las acciones disponibles si se piden', async () => {
    const sin = new PartidaActor(mesa, preTirada);
    const con = new PartidaActor(mesa, preTirada, { incluirAcciones: true });
    const alSin = vi.fn();
    const alCon = vi.fn();
    sin.suscribir(a, alSin);
    con.suscribir(a, alCon);
    await sin.enviar(tirar);
    await con.enviar(tirar);
    expect(alSin.mock.calls[0]![0].acciones).toEqual([]);
    expect(alCon.mock.calls[0]![0].acciones.length).toBeGreaterThan(0);
  });
});

describe('PartidaActor: vista de quien entra o se reconecta', () => {
  it('da la vista actual de cada observador sin esperar a la próxima jugada', async () => {
    const actor = new PartidaActor(mesa, preTirada);
    await actor.enviar(tirar);
    expect(actor.vista(c)).toEqual(vistaPara(actor.estado, c));
    expect(actor.vista(null)).toEqual(vistaPara(actor.estado, null));
  });

  it('pedir la vista de un jugador que no participa lanza', () => {
    const actor = new PartidaActor(mesa, preTirada);
    expect(() => actor.vista('fantasma')).toThrow(/fantasma/);
  });

  it('da también el tablero, que no cambia con las jugadas, para dibujarlo al entrar', async () => {
    const actor = new PartidaActor(mesa, preTirada);
    const antes = actor.mesaPublica;
    expect(antes).toEqual(mesaPublica(mesa));
    await actor.enviar(tirar);
    expect(actor.mesaPublica).toBe(antes);
  });
});
