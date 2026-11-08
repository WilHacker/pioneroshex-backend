import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { OPCIONES_LIMITE_HTTP } from '../../infra/http/limite-http.guard.js';
import { RepositorioSalas } from '../../infra/salas/repositorio-salas.js';
import { RepositorioSalasMemoria } from '../../infra/salas/repositorio-salas.memoria.js';
import { AdaptadorSocketIo } from '../../infra/socket/socket-io.adapter.js';
import { moduloDePrueba } from '../pruebas-nest.js';
import { JuegoModule } from './juego.module.js';

interface Credencial {
  salaId: string;
  jugadorId: string;
  token: string;
}
interface Estado {
  id: string;
  empezada: boolean;
  anfitrion: string;
  jugadores: { id: string; nombre: string }[];
  conectados: string[];
}
interface Portada {
  salas: { id: string; anfitrion: string; jugadores: number }[];
  resumen: { salasAbiertas: number };
}

let app: INestApplication;
let url: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  const modulo = await moduloDePrueba([JuegoModule])
    .overrideProvider(RepositorioSalas)
    .useValue(new RepositorioSalasMemoria())
    .overrideProvider(OPCIONES_LIMITE_HTTP)
    .useValue({ maximo: 10_000 })
    .compile();
  app = modulo.createNestApplication();
  app.useWebSocketAdapter(new AdaptadorSocketIo(app, 'http://localhost:3000'));
  await app.listen(0, '127.0.0.1');
  url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});

afterEach(() => {
  for (const s of sockets.splice(0)) s.disconnect();
});

afterAll(() => app.close());

/** Espera el próximo evento; falla con un mensaje claro si no llega. */
const esperar = <T>(socket: Socket, evento: string, ms = 3000): Promise<T> =>
  new Promise((resolver, rechazar) => {
    const reloj = setTimeout(() => rechazar(new Error(`no llegó "${evento}"`)), ms);
    socket.once(evento, (datos: T) => {
      clearTimeout(reloj);
      resolver(datos);
    });
  });

const pausa = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Abre un socket del lobby y NO espera nada: así el test registra antes lo que quiera escuchar. */
function abrir(auth: object): Socket {
  const socket = io(`${url}/lobby`, {
    auth,
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  sockets.push(socket);
  return socket;
}

const crear = async (nombre: string, publica = false): Promise<Credencial> =>
  (await request(url).post('/salas').send({ nombre, publica })).body as Credencial;
const unirse = async (salaId: string, nombre: string): Promise<Credencial> =>
  (await request(url).post(`/salas/${salaId}/unirse`).send({ nombre })).body as Credencial;

describe('socket /lobby: sala de espera', () => {
  it('al conectar entrega el estado de la sala, sin tokens ni nadie conectado', async () => {
    const ana = await crear('Ana');
    const socket = abrir({ salaId: ana.salaId });
    const estado = await esperar<Estado>(socket, 'sala:estado');
    expect(estado).toMatchObject({ id: ana.salaId, empezada: false, conectados: [] });
    expect(estado.jugadores.map((j) => j.nombre)).toEqual(['Ana']);
    expect(JSON.stringify(estado)).not.toContain(ana.token);
  });

  it('empuja el estado nuevo cuando alguien entra, sin que nadie pregunte', async () => {
    const ana = await crear('Ana');
    const socket = abrir({ salaId: ana.salaId });
    await esperar(socket, 'sala:estado');
    const siguiente = esperar<Estado>(socket, 'sala:estado');
    await unirse(ana.salaId, 'Beto');
    expect((await siguiente).jugadores.map((j) => j.nombre)).toEqual(['Ana', 'Beto']);
  });

  it('quien conecta con su token figura como conectado, y deja de figurar al irse', async () => {
    const ana = await crear('Ana');
    const beto = await unirse(ana.salaId, 'Beto');
    const mirando = abrir({ salaId: ana.salaId });
    expect((await esperar<Estado>(mirando, 'sala:estado')).conectados).toEqual([]);

    const entra = esperar<Estado>(mirando, 'sala:estado');
    const delBeto = abrir({ salaId: ana.salaId, token: beto.token });
    expect((await entra).conectados).toEqual([beto.jugadorId]);

    const sale = esperar<Estado>(mirando, 'sala:estado');
    delBeto.disconnect();
    expect((await sale).conectados).toEqual([]);
  });

  it('con dos pestañas del mismo jugador sigue conectado hasta cerrar la última', async () => {
    const ana = await crear('Ana');
    const mirando = abrir({ salaId: ana.salaId });
    await esperar(mirando, 'sala:estado');
    const a = abrir({ salaId: ana.salaId, token: ana.token });
    await esperar(a, 'sala:estado');
    const b = abrir({ salaId: ana.salaId, token: ana.token });
    await esperar(b, 'sala:estado');
    a.disconnect();
    await pausa(200);
    const otro = abrir({ salaId: ana.salaId });
    expect((await esperar<Estado>(otro, 'sala:estado')).conectados).toEqual([ana.jugadorId]);
    b.disconnect();
  });

  it('un token que no vale entra como espectador: ve la sala pero no figura conectado', async () => {
    const ana = await crear('Ana');
    const socket = abrir({ salaId: ana.salaId, token: 'inventado' });
    expect((await esperar<Estado>(socket, 'sala:estado')).conectados).toEqual([]);
  });

  it('avisa cuando la sala desaparece', async () => {
    const ana = await crear('Ana');
    const socket = abrir({ salaId: ana.salaId });
    await esperar(socket, 'sala:estado');
    const cerrada = esperar(socket, 'sala:cerrada');
    await request(url)
      .post(`/salas/${ana.salaId}/salir`)
      .set('Authorization', `Bearer ${ana.token}`)
      .expect(204);
    await cerrada;
  });

  it('una sala que no existe se rechaza', async () => {
    const socket = abrir({ salaId: 'noexiste' });
    expect(await esperar<{ motivo: string }>(socket, 'lobby:error')).toEqual({
      motivo: 'SALA_NO_EXISTE',
    });
  });

  it('una petición mal formada se rechaza', async () => {
    const socket = abrir({ salaId: 5 });
    expect((await esperar<{ motivo: string }>(socket, 'lobby:error')).motivo).toBe(
      'PETICION_INVALIDA',
    );
  });

  it('no mezcla salas: lo de una no llega a quien mira otra', async () => {
    const ana = await crear('Ana');
    const otra = await crear('Zoe');
    const socket = abrir({ salaId: otra.salaId });
    await esperar(socket, 'sala:estado');
    let llego = false;
    socket.on('sala:estado', () => (llego = true));
    await unirse(ana.salaId, 'Beto');
    await pausa(200);
    expect(llego).toBe(false);
  });
});

describe('socket /lobby: portada', () => {
  it('entrega las salas públicas abiertas y las empuja cuando cambian', async () => {
    const socket = abrir({});
    const primera = await esperar<Portada>(socket, 'portada:salas');
    const siguiente = esperar<Portada>(socket, 'portada:salas');
    const ana = await crear('Publica', true);
    const despues = await siguiente;
    expect(despues.salas.some((s) => s.id === ana.salaId)).toBe(true);
    expect(despues.resumen.salasAbiertas).toBe(primera.resumen.salasAbiertas + 1);
  });

  it('una sala privada no sale en la lista pero sí cuenta en el resumen', async () => {
    const socket = abrir({});
    const primera = await esperar<Portada>(socket, 'portada:salas');
    const siguiente = esperar<Portada>(socket, 'portada:salas');
    const ana = await crear('Privada', false);
    const despues = await siguiente;
    expect(despues.salas.some((s) => s.id === ana.salaId)).toBe(false);
    expect(despues.resumen.salasAbiertas).toBe(primera.resumen.salasAbiertas + 1);
  });
});
