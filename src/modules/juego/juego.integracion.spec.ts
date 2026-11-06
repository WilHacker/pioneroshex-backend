import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AdaptadorSocketIo } from '../../infra/socket/socket-io.adapter.js';
import { RepositorioSalasMemoria } from '../../infra/salas/repositorio-salas.memoria.js';
import { RepositorioSalas } from '../../infra/salas/repositorio-salas.js';
import { JuegoModule } from './juego.module.js';
import { OPCIONES_LIMITE_HTTP } from './limite-http.guard.js';
import { SalasService } from './salas.service.js';

interface Credencial {
  salaId: string;
  jugadorId: string;
  token: string;
}
interface Inicio {
  jugadorId: string;
  mesa: { vertices: { id: string }[] };
  vista: { turnoDe: string | null; yo: string };
  acciones: { tipo: string; disponible: boolean }[];
  sitios: { poblados: string[]; caminos: string[] };
}

let app: INestApplication;
let url: string;
let salas: SalasService;
const sockets: Socket[] = [];

beforeAll(async () => {
  const modulo = await Test.createTestingModule({ imports: [JuegoModule] })
    .overrideProvider(RepositorioSalas)
    .useValue(new RepositorioSalasMemoria())
    .overrideProvider(OPCIONES_LIMITE_HTTP)
    .useValue({ maximo: 10_000 })
    .compile();
  app = modulo.createNestApplication();
  app.useWebSocketAdapter(new AdaptadorSocketIo(app, 'http://localhost:3000'));
  await app.listen(0, '127.0.0.1');
  url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  salas = modulo.get(SalasService);
});

afterEach(() => {
  for (const s of sockets.splice(0)) s.disconnect();
});

afterAll(() => app.close());

const esperar = <T>(socket: Socket, evento: string): Promise<T> =>
  new Promise((resolver) => socket.once(evento, resolver));

/** Conecta y espera a que el servidor conteste: `juego:inicio` si entra, `juego:error` si no. */
async function conectar(
  auth: object,
): Promise<{ socket: Socket; inicio?: Inicio; error?: unknown }> {
  const socket = io(url, { auth, transports: ['websocket'], forceNew: true, reconnection: false });
  sockets.push(socket);
  const resultado = await Promise.race([
    esperar<Inicio>(socket, 'juego:inicio').then((inicio) => ({ inicio })),
    esperar<unknown>(socket, 'juego:error').then((error) => ({ error })),
  ]);
  return { socket, ...resultado };
}

async function partidaEmpezada(): Promise<{ a: Credencial; b: Credencial }> {
  const a = (await request(url).post('/salas').send({ nombre: 'Ana' })).body as Credencial;
  const b = (await request(url).post(`/salas/${a.salaId}/unirse`).send({ nombre: 'Beto' }))
    .body as Credencial;
  await request(url).post(`/salas/${a.salaId}/empezar`).set('Authorization', `Bearer ${a.token}`);
  return { a, b };
}

const accion = (socket: Socket, cuerpo: unknown): Promise<{ ok: boolean; motivo?: string }> =>
  socket.timeout(5000).emitWithAck('juego:accion', cuerpo);

describe('API HTTP de salas', () => {
  it('crear, unirse, ver y empezar una sala', async () => {
    const creada = await request(url).post('/salas').send({ nombre: '  Ana ' }).expect(201);
    const a = creada.body as Credencial;
    expect(a.jugadorId).toBe('j1');
    await request(url).post(`/salas/${a.salaId}/unirse`).send({ nombre: 'Beto' }).expect(201);
    const vista = await request(url).get(`/salas/${a.salaId}`).expect(200);
    expect(vista.body).toMatchObject({
      empezada: false,
      jugadores: [{ nombre: 'Ana' }, { nombre: 'Beto' }],
    });
    expect(JSON.stringify(vista.body)).not.toContain(a.token);
    await request(url)
      .post(`/salas/${a.salaId}/empezar`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ puntosVictoria: 5 })
      .expect(204);
    expect(salas.partida(a.salaId)?.estado.config.puntosVictoria).toBe(5);
  });

  it('valida el cuerpo (400), la sala (404) y el token (401/403)', async () => {
    await request(url).post('/salas').send({ nombre: '' }).expect(400);
    await request(url).post('/salas').send({ nombre: 'Ana', extra: 1 }).expect(400);
    await request(url).post('/salas/00000000/unirse').send({ nombre: 'Ana' }).expect(404);
    await request(url).get('/salas/00000000').expect(404);
    const a = (await request(url).post('/salas').send({ nombre: 'Ana' })).body as Credencial;
    const b = (await request(url).post(`/salas/${a.salaId}/unirse`).send({ nombre: 'Beto' }))
      .body as Credencial;
    await request(url).post(`/salas/${a.salaId}/empezar`).expect(401);
    await request(url)
      .post(`/salas/${a.salaId}/empezar`)
      .set('Authorization', 'Basic x')
      .expect(401);
    await request(url)
      .post(`/salas/${a.salaId}/empezar`)
      .set('Authorization', `Bearer ${b.token}`)
      .expect(403);
    await request(url)
      .post(`/salas/${a.salaId}/empezar`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ semillaAzar: 'trampa' })
      .expect(400);
  });
});

describe('Límite de peticiones HTTP', () => {
  it('responde 429 cuando una dirección pasa del máximo', async () => {
    const modulo = await Test.createTestingModule({ imports: [JuegoModule] })
      .overrideProvider(RepositorioSalas)
      .useValue(new RepositorioSalasMemoria())
      .overrideProvider(OPCIONES_LIMITE_HTTP)
      .useValue({ maximo: 2 })
      .compile();
    const limitada = modulo.createNestApplication();
    await limitada.listen(0, '127.0.0.1');
    const direccion = limitada.getHttpServer().address() as AddressInfo;
    const base = `http://127.0.0.1:${direccion.port}`;
    try {
      await request(base).post('/salas').send({ nombre: 'Ana' }).expect(201);
      await request(base).post('/salas').send({ nombre: 'Beto' }).expect(201);
      await request(base).post('/salas').send({ nombre: 'Cleo' }).expect(429);
    } finally {
      await limitada.close();
    }
  });
});

describe('Socket del juego', () => {
  it('sin credenciales válidas no se entra', async () => {
    const { a } = await partidaEmpezada();
    for (const auth of [
      {},
      { salaId: a.salaId, token: 'falso' },
      { salaId: '00000000', token: a.token },
    ]) {
      const { error } = await conectar(auth);
      expect(error).toEqual({ motivo: 'NO_AUTORIZADO' });
    }
  });

  it('una sala que no ha empezado no deja entrar al juego', async () => {
    const a = (await request(url).post('/salas').send({ nombre: 'Ana' })).body as Credencial;
    const { error } = await conectar({ salaId: a.salaId, token: a.token });
    expect(error).toEqual({ motivo: 'PARTIDA_NO_EMPEZADA' });
  });

  it('al entrar entrega la mesa, su vista y sus acciones, sin ninguna semilla secreta', async () => {
    const { a } = await partidaEmpezada();
    const { inicio, socket } = await conectar({ salaId: a.salaId, token: a.token });
    expect(inicio?.jugadorId).toBe('j1');
    expect(inicio?.vista.yo).toBe('j1');
    expect(inicio?.mesa.vertices.length).toBeGreaterThan(0);
    expect(inicio?.acciones.length).toBeGreaterThan(0);
    // Solo quien tiene el turno recibe sitios donde poner su poblado.
    expect((inicio?.sitios.poblados.length ?? 0) > 0).toBe(
      inicio?.vista.turnoDe === inicio?.jugadorId,
    );
    const secreta = salas.partida(a.salaId)!.estado.config.semillaAzar;
    expect(JSON.stringify(inicio)).not.toContain(secreta);
    socket.disconnect();
  });

  it('una acción válida llega a todos con su propia vista; el cliente no fija el jugador', async () => {
    const { a, b } = await partidaEmpezada();
    const uno = await conectar({ salaId: a.salaId, token: a.token });
    const dos = await conectar({ salaId: a.salaId, token: b.token });
    const turno = uno.inicio!.vista.turnoDe!;
    const [enTurno, otro] = turno === 'j1' ? [uno, dos] : [dos, uno];
    const vertice = uno.inicio!.mesa.vertices[0]!.id;

    const aviso1 = esperar<{ vista: { yo: string } }>(enTurno.socket, 'juego:notificacion');
    const aviso2 = esperar<{ vista: { yo: string } }>(otro.socket, 'juego:notificacion');
    const respuesta = await accion(enTurno.socket, { tipo: 'COLOCAR_POBLADO_INICIAL', vertice });
    expect(respuesta).toEqual({ ok: true });
    expect((await aviso1).vista.yo).toBe(turno);
    expect((await aviso2).vista.yo).not.toBe(turno);
  });

  it('rechaza lo mal formado, los campos de más y lo que no toca', async () => {
    const { a, b } = await partidaEmpezada();
    const uno = await conectar({ salaId: a.salaId, token: a.token });
    const dos = await conectar({ salaId: a.salaId, token: b.token });
    const turno = uno.inicio!.vista.turnoDe!;
    const [enTurno, otro] = turno === 'j1' ? [uno, dos] : [dos, uno];
    const vertice = uno.inicio!.mesa.vertices[0]!.id;

    expect(await accion(enTurno.socket, { tipo: 'HACER_TRAMPA' })).toMatchObject({
      motivo: 'ACCION_INVALIDA',
    });
    expect(await accion(enTurno.socket, 'hola')).toMatchObject({ motivo: 'ACCION_INVALIDA' });
    expect(await accion(enTurno.socket, { tipo: 'TIRAR_DADOS', jugador: 'j9' })).toMatchObject({
      motivo: 'ACCION_INVALIDA',
    });
    expect(await accion(otro.socket, { tipo: 'COLOCAR_POBLADO_INICIAL', vertice })).toEqual({
      ok: false,
      motivo: 'NO_ES_TU_TURNO',
    });
  });

  it('limita cuántas acciones por segundo puede mandar un socket', async () => {
    const { a } = await partidaEmpezada();
    const { socket } = await conectar({ salaId: a.salaId, token: a.token });
    const respuestas = await Promise.all(
      Array.from({ length: 40 }, () => accion(socket, { tipo: 'TERMINAR_TURNO' })),
    );
    expect(respuestas.filter((r) => r.motivo === 'DEMASIADAS_ACCIONES').length).toBeGreaterThan(0);
  });

  it('al desconectarse deja de estar suscrito', async () => {
    const { a } = await partidaEmpezada();
    const { socket } = await conectar({ salaId: a.salaId, token: a.token });
    const actor = salas.partida(a.salaId)!;
    expect(actor.suscriptores).toBe(1);
    socket.disconnect();
    await new Promise((resolver) => setTimeout(resolver, 100));
    expect(actor.suscriptores).toBe(0);
  });
});
