import { describe, expect, it } from 'vitest';
import { RepositorioHistorialMemoria } from './repositorio-historial.memoria.js';
import type { ResultadoDePartida } from './repositorio-historial.js';

const partida = (id: string, terminadaEn: number, gana: 'ana' | 'beto'): ResultadoDePartida => ({
  id,
  terminadaEn,
  puntosVictoria: 10,
  ganador: gana === 'ana' ? 'Ana' : 'Beto',
  participantes: [
    { usuarioId: 'u-ana', nombre: 'Ana', puntos: gana === 'ana' ? 10 : 6, gano: gana === 'ana' },
    { usuarioId: null, nombre: 'Beto', puntos: gana === 'beto' ? 10 : 7, gano: gana === 'beto' },
  ],
});

describe('RepositorioHistorialMemoria', () => {
  it('registra una partida una sola vez', async () => {
    const repo = new RepositorioHistorialMemoria();

    expect(await repo.registrar(partida('p1', 1, 'ana'))).toBe(true);
    expect(await repo.registrar(partida('p1', 1, 'ana'))).toBe(false);
    expect((await repo.estadisticasDe('u-ana')).partidas).toBe(1);
  });

  it('calcula partidas, victorias y promedio, con las más recientes primero', async () => {
    const repo = new RepositorioHistorialMemoria();
    await repo.registrar(partida('p1', 100, 'ana'));
    await repo.registrar(partida('p2', 300, 'beto'));
    await repo.registrar(partida('p3', 200, 'ana'));

    const e = await repo.estadisticasDe('u-ana');

    expect(e).toMatchObject({ partidas: 3, victorias: 2, promedioPuntos: 8.7 });
    expect(e.ultimas.map((u) => u.partidaId)).toEqual(['p2', 'p3', 'p1']);
    expect(e.ultimas[0]).toMatchObject({ gano: false, puntos: 6, ganador: 'Beto', jugadores: 2 });
  });

  it('solo muestra las 10 más recientes y, sin partidas, todo en cero', async () => {
    const repo = new RepositorioHistorialMemoria();
    await Promise.all(
      Array.from({ length: 12 }, (_, i) => repo.registrar(partida(`p${i}`, i, 'ana'))),
    );

    expect((await repo.estadisticasDe('u-ana')).ultimas).toHaveLength(10);
    expect(await repo.estadisticasDe('nadie')).toEqual({
      partidas: 0,
      victorias: 0,
      promedioPuntos: 0,
      ultimas: [],
    });
  });

  it('desvincular una cuenta deja sus partidas sin dueño y no toca las de los demás', async () => {
    const repo = new RepositorioHistorialMemoria();
    await repo.registrar(partida('p1', 1, 'ana'));

    await repo.desvincularUsuario('u-ana');

    expect((await repo.estadisticasDe('u-ana')).partidas).toBe(0);
    expect(await repo.registrar(partida('p1', 1, 'ana'))).toBe(false);
  });
});
