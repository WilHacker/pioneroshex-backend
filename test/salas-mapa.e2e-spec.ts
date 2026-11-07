import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { aMapaConfig, infoDelMapa, mapaDelCatalogo } from '../src/core/catalogo/catalogo.js';
import { crearPartida } from '../src/core/estado/crear.js';
import { crearMesa } from '../src/core/estado/mesa.js';
import { crearGameConfig } from '../src/core/partida/game-config.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RepositorioSalasPrisma } from '../src/infra/prisma/repositorio-salas.prisma.js';
import { RepositorioSalas } from '../src/infra/salas/repositorio-salas.js';

/** Un hexágono, uno con lagos y el más grande: la lista de casillas viaja dentro de la config. */
const MAPAS = ['clasico', 'lagos', 'tierra'] as const;

describe('Partidas con mapa propio guardadas en PostgreSQL (e2e)', () => {
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

  it.each(MAPAS)(
    '«%s»: se guarda, se recarga y reconstruye la misma mesa (tablero y puertos)',
    async (idMapa) => {
      const entrada = mapaDelCatalogo(idMapa)!;
      const jugadores = infoDelMapa(entrada).minimoRecomendado;
      const config = crearGameConfig({
        semillaMapa: `E2E-${idMapa}`,
        semillaAzar: `#e2e-azar-${idMapa}`,
        jugadores,
        mapa: aMapaConfig(entrada),
      });
      const mesa = crearMesa(config);
      const estado = crearPartida(
        mesa,
        Array.from({ length: jugadores }, (_, i) => `j${i + 1}`),
      );

      const id = `m${idMapa.slice(0, 3)}${Date.now().toString(16).slice(-4)}`;
      creadas.push(id);
      await repo.guardar({
        id,
        anfitrion: 'j1',
        jugadores: [{ id: 'j1', nombre: 'Ana', tokenHash: 'abc' }],
        partidaId: id,
        publica: false,
        opciones: {},
        estado,
        actualizadaEn: 1_700_000_000_000,
      });

      const guardada = (await repo.cargarTodas()).find((s) => s.id === id);
      expect(guardada?.estado).toEqual(estado);
      expect(guardada?.estado?.config.mapa?.casillas).toHaveLength(entrada.casillas.length);

      // Lo que hace SalasService al arrancar: reconstruir la mesa desde la config guardada.
      const restaurada = crearMesa(guardada!.estado!.config);
      // Independiente de `crearMesa`: el mapa restaurado tiene la forma pedida, no otra parecida.
      expect(restaurada.mapa.casillas).toHaveLength(entrada.casillas.length);
      expect(restaurada.mapa).toEqual(mesa.mapa);
      expect(restaurada.tablero).toEqual(mesa.tablero);
      expect(restaurada.puertos).toEqual(mesa.puertos);
    },
  );
});
