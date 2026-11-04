import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('GET /health (e2e)', () => {
  let app: INestApplication<Server>;

  beforeEach(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('responde 200 con estado ok', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ estado: 'ok', baseDatos: 'ok' });
  });
});
