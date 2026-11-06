import { describe, expect, it } from 'vitest';
import { RepositorioSalasMemoria } from './repositorio-salas.memoria.js';
import type { SalaGuardada } from './repositorio-salas.js';

const sala: SalaGuardada = {
  id: 'aaaa1111',
  anfitrion: 'j1',
  jugadores: [{ id: 'j1', nombre: 'Ana', tokenHash: 'h' }],
  partidaId: null,
  publica: false,
  opciones: {},
  estado: null,
  actualizadaEn: 5,
};

describe('RepositorioSalasMemoria', () => {
  it('guarda, recarga y elimina', async () => {
    const repo = new RepositorioSalasMemoria();
    await repo.guardar(sala);
    await repo.guardar({ ...sala, id: 'bbbb2222' });
    expect(await repo.cargarTodas()).toHaveLength(2);
    await repo.eliminar('aaaa1111');
    expect((await repo.cargarTodas()).map((s) => s.id)).toEqual(['bbbb2222']);
  });

  it('guardar de nuevo con el mismo id reemplaza la fila', async () => {
    const repo = new RepositorioSalasMemoria();
    await repo.guardar(sala);
    await repo.guardar({ ...sala, actualizadaEn: 9 });
    const todas = await repo.cargarTodas();
    expect(todas).toHaveLength(1);
    expect(todas[0]?.actualizadaEn).toBe(9);
  });

  it('devuelve copias: modificar lo cargado no toca lo guardado', async () => {
    const repo = new RepositorioSalasMemoria();
    await repo.guardar(sala);
    const [cargada] = await repo.cargarTodas();
    (cargada as { actualizadaEn: number }).actualizadaEn = 99;
    expect((await repo.cargarTodas())[0]?.actualizadaEn).toBe(5);
  });
});
