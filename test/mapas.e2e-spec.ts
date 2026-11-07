import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RepositorioSalas } from '../src/infra/salas/repositorio-salas.js';
import { PartidasService } from '../src/modules/juego/partidas.service.js';
import { SalasService } from '../src/modules/juego/salas.service.js';

describe('Elegir mapa por HTTP y restaurarlo desde PostgreSQL (e2e)', () => {
  let app: INestApplication<Server>;
  const creadas: string[] = [];

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.get(PrismaService).sala.deleteMany({ where: { id: { in: creadas } } });
    await app.close();
  });

  it('GET /mapas devuelve el catálogo con su forma', async () => {
    const respuesta = await request(app.getHttpServer()).get('/mapas').expect(200);
    const lista = respuesta.body as { id: string; casillas: number; forma: unknown[] }[];
    expect(lista).toHaveLength(15);
    const tierra = lista.find((m) => m.id === 'tierra')!;
    expect(tierra.casillas).toBe(94);
    expect(tierra.forma).toHaveLength(94);
  });

  it('elige un mapa, empieza y la partida se restaura con ese mapa tras un reinicio', async () => {
    const servidor = app.getHttpServer();
    const creada = await request(servidor).post('/salas').send({ nombre: 'Ana' }).expect(201);
    const { salaId, token } = creada.body as { salaId: string; token: string };
    creadas.push(salaId);
    const auth = { Authorization: `Bearer ${token}` };

    await request(servidor).post(`/salas/${salaId}/unirse`).send({ nombre: 'Beto' }).expect(201);
    await request(servidor)
      .patch(`/salas/${salaId}`)
      .set(auth)
      .send({ mapa: 'no-existe' })
      .expect(400);
    await request(servidor).patch(`/salas/${salaId}`).set(auth).send({ mapa: 'lagos' }).expect(204);

    const sala = await request(servidor).get(`/salas/${salaId}`).expect(200);
    expect(sala.body).toMatchObject({ maximo: 12, opciones: { mapa: 'lagos' } });

    await request(servidor).post(`/salas/${salaId}/empezar`).set(auth).send({}).expect(204);

    // Un reinicio del servidor: un servicio nuevo que lee la base de datos.
    const reiniciado = new SalasService(new PartidasService(), app.get(RepositorioSalas));
    await reiniciado.onModuleInit();
    reiniciado.onModuleDestroy();

    const restaurada = reiniciado.partida(salaId);
    expect(restaurada?.estado.config.mapa?.nombre).toBe('Lagos');
    expect(restaurada?.mesaPublica.casillas).toHaveLength(58);
  });
});
