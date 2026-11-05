import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { RepositorioSalasPrisma } from '../src/infra/prisma/repositorio-salas.prisma.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { PartidasService } from '../src/modules/juego/partidas.service.js';
import { SalasService } from '../src/modules/juego/salas.service.js';
import { RepositorioSalas } from '../src/infra/salas/repositorio-salas.js';

describe('Salas guardadas en PostgreSQL (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: RepositorioSalasPrisma;
  const creadas: string[] = [];

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    repo = app.get(RepositorioSalas) as RepositorioSalasPrisma;
  });

  afterAll(async () => {
    await prisma.sala.deleteMany({ where: { id: { in: creadas } } });
    await app.close();
  });

  it('guarda, recarga con los mismos datos y elimina', async () => {
    const id = `e2e${Date.now().toString(16).slice(-5)}`;
    creadas.push(id);
    const sala = {
      id,
      anfitrion: 'j1',
      jugadores: [{ id: 'j1', nombre: 'Ana', tokenHash: 'abc' }],
      partidaId: null,
      estado: null,
      actualizadaEn: 1_700_000_000_000,
    };
    await repo.guardar(sala);
    await repo.guardar({ ...sala, actualizadaEn: 1_700_000_005_000 });
    const guardada = (await repo.cargarTodas()).find((s) => s.id === id);
    expect(guardada).toEqual({ ...sala, actualizadaEn: 1_700_000_005_000 });
    await repo.eliminar(id);
    expect((await repo.cargarTodas()).find((s) => s.id === id)).toBeUndefined();
  });

  it('una partida entera sobrevive a un reinicio: mismo estado y mismos tokens', async () => {
    const salas = app.get(SalasService);
    const a = await salas.crear('Ana');
    creadas.push(a.salaId);
    const b = await salas.unirse(a.salaId, 'Beto');
    await salas.empezar(a.salaId, a.token, {});
    const antes = salas.partida(a.salaId)!.estado;

    const reiniciado = new SalasService(new PartidasService(), repo);
    await reiniciado.onModuleInit();
    reiniciado.onModuleDestroy();

    expect(reiniciado.partida(a.salaId)?.estado).toEqual(antes);
    expect(reiniciado.autenticar(a.salaId, b.token)).toBe('j2');
  });
});
