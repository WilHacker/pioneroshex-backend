import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { RepositorioCuentas } from '../src/infra/cuentas/repositorio-cuentas.js';
import { RepositorioHistorial } from '../src/infra/historial/repositorio-historial.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';

describe('Cuentas guardadas en PostgreSQL (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: RepositorioCuentas;
  let historial: RepositorioHistorial;
  const sufijo = Date.now().toString(36);
  const usuario = (n: string) => ({
    id: `e2e-${sufijo}-${n}`,
    nombre: `E2E ${n}`,
    nombreNorm: `e2e ${sufijo} ${n}`,
    hashContrasena: 'scrypt$prueba',
    creadoEn: Date.now(),
  });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    repo = app.get(RepositorioCuentas);
    historial = app.get(RepositorioHistorial);
  });

  afterAll(async () => {
    await prisma.partida.deleteMany({ where: { id: { startsWith: `e2e-${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { startsWith: `e2e-${sufijo}` } } });
    await app.close();
  });

  it('crea un usuario, lo encuentra y rechaza el nombre repetido sin lanzar', async () => {
    const ana = usuario('ana');

    expect(await repo.crearUsuario(ana)).toBe(true);
    expect(await repo.crearUsuario({ ...ana, id: `${ana.id}-otro` })).toBe(false);
    expect(await repo.usuarioPorNombre(ana.nombreNorm)).toEqual(ana);
    expect((await repo.usuarioPorId(ana.id))?.nombre).toBe(ana.nombre);
    expect(await repo.usuarioPorId('no-existe')).toBeNull();
  });

  it('guarda y renueva sesiones, borra por usuario y las vencidas', async () => {
    const beto = usuario('beto');
    await repo.crearUsuario(beto);
    const hash = `h-${sufijo}-1`;

    await repo.guardarSesion({ tokenHash: hash, usuarioId: beto.id, expiraEn: 1000 });
    await repo.guardarSesion({ tokenHash: hash, usuarioId: beto.id, expiraEn: 2000 });
    expect((await repo.sesionPorHash(hash))?.expiraEn).toBe(2000);

    await repo.borrarSesionesVencidas(5000);
    expect(await repo.sesionPorHash(hash)).toBeNull();
    await repo.guardarSesion({ tokenHash: hash, usuarioId: beto.id, expiraEn: 9_999_999_999_999 });
    await repo.borrarSesionesDe(beto.id);
    expect(await repo.sesionPorHash(hash)).toBeNull();
  });

  it('reemplaza los códigos y borrar el usuario se lleva sesiones y códigos', async () => {
    const cleo = usuario('cleo');
    await repo.crearUsuario(cleo);
    await repo.reemplazarCodigos(cleo.id, ['a', 'b', 'c']);
    await repo.reemplazarCodigos(cleo.id, ['d', 'e']);
    await repo.guardarSesion({
      tokenHash: `h-${sufijo}-2`,
      usuarioId: cleo.id,
      expiraEn: 9_999_999_999_999,
    });

    expect(await prisma.codigoRecuperacion.count({ where: { usuarioId: cleo.id } })).toBe(2);
    await repo.borrarUsuario(cleo.id);
    expect(await repo.usuarioPorId(cleo.id)).toBeNull();
    expect(await prisma.codigoRecuperacion.count({ where: { usuarioId: cleo.id } })).toBe(0);
    expect(await repo.sesionPorHash(`h-${sufijo}-2`)).toBeNull();
  });

  it('el historial se registra una vez, da estadísticas y sobrevive al borrar la cuenta', async () => {
    const dani = usuario('dani');
    await repo.crearUsuario(dani);
    const partida = (n: number, gano: boolean) => ({
      id: `e2e-${sufijo}-p${n}`,
      terminadaEn: 1000 * n,
      puntosVictoria: 10,
      ganador: gano ? 'Dani' : 'Otro',
      participantes: [
        { usuarioId: dani.id, nombre: 'Dani', puntos: gano ? 10 : 6, gano },
        { usuarioId: null, nombre: 'Otro', puntos: gano ? 7 : 10, gano: !gano },
      ],
    });

    expect(await historial.registrar(partida(1, true))).toBe(true);
    expect(await historial.registrar(partida(1, true))).toBe(false);
    await historial.registrar(partida(2, false));

    const e = await historial.estadisticasDe(dani.id);
    expect(e).toMatchObject({ partidas: 2, victorias: 1, promedioPuntos: 8 });
    expect(e.ultimas.map((u) => u.partidaId)).toEqual([`e2e-${sufijo}-p2`, `e2e-${sufijo}-p1`]);

    await historial.desvincularUsuario(dani.id);
    expect((await historial.estadisticasDe(dani.id)).partidas).toBe(0);
    expect(await prisma.participacion.count({ where: { partidaId: `e2e-${sufijo}-p1` } })).toBe(2);
    await repo.borrarUsuario(dani.id);
  });

  it('si una cuenta se borra mientras juega, el resultado se guarda igual con esa participación sin dueño', async () => {
    const eva = usuario('eva');
    await repo.crearUsuario(eva);
    await repo.borrarUsuario(eva.id);

    const registrada = await historial.registrar({
      id: `e2e-${sufijo}-fantasma`,
      terminadaEn: 1,
      puntosVictoria: 10,
      ganador: 'Eva',
      participantes: [
        { usuarioId: eva.id, nombre: 'Eva', puntos: 10, gano: true },
        { usuarioId: null, nombre: 'Otro', puntos: 4, gano: false },
      ],
    });

    expect(registrada).toBe(true);
    expect(
      await prisma.participacion.count({
        where: { partidaId: `e2e-${sufijo}-fantasma`, usuarioId: null },
      }),
    ).toBe(2);
  });
});
