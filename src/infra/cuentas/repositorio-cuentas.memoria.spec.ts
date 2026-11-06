import { describe, expect, it } from 'vitest';
import { RepositorioCuentasMemoria } from './repositorio-cuentas.memoria.js';
import type { UsuarioGuardado } from './repositorio-cuentas.js';

const ana: UsuarioGuardado = {
  id: 'u1',
  nombre: 'Ana',
  nombreNorm: 'ana',
  hashContrasena: 'scrypt$x',
  creadoEn: 1,
};

describe('RepositorioCuentasMemoria', () => {
  it('no deja crear dos usuarios con el mismo nombre normalizado', async () => {
    const repo = new RepositorioCuentasMemoria();

    expect(await repo.crearUsuario(ana)).toBe(true);
    expect(await repo.crearUsuario({ ...ana, id: 'u2', nombre: 'ANA' })).toBe(false);
    expect((await repo.usuarioPorNombre('ana'))?.id).toBe('u1');
    expect(await repo.usuarioPorId('u2')).toBeNull();
  });

  it('guarda, busca y borra sesiones, también por usuario y vencidas', async () => {
    const repo = new RepositorioCuentasMemoria();
    await repo.guardarSesion({ tokenHash: 'a', usuarioId: 'u1', expiraEn: 10 });
    await repo.guardarSesion({ tokenHash: 'b', usuarioId: 'u1', expiraEn: 100 });
    await repo.guardarSesion({ tokenHash: 'c', usuarioId: 'u2', expiraEn: 100 });

    expect((await repo.sesionPorHash('a'))?.usuarioId).toBe('u1');
    await repo.borrarSesionesVencidas(50);
    expect(await repo.sesionPorHash('a')).toBeNull();
    await repo.borrarSesionesDe('u1');
    expect(await repo.sesionPorHash('b')).toBeNull();
    expect(await repo.sesionPorHash('c')).not.toBeNull();
    await repo.borrarSesion('c');
    expect(await repo.sesionPorHash('c')).toBeNull();
  });

  it('reemplazar códigos descarta los anteriores y borrar el usuario se lleva todo', async () => {
    const repo = new RepositorioCuentasMemoria();
    await repo.crearUsuario(ana);
    await repo.reemplazarCodigos('u1', ['h1', 'h2']);
    await repo.reemplazarCodigos('u1', ['h3']);
    await repo.guardarSesion({ tokenHash: 'a', usuarioId: 'u1', expiraEn: 100 });

    expect(repo.codigosDe('u1')).toEqual(['h3']);
    await repo.borrarUsuario('u1');
    expect(await repo.usuarioPorId('u1')).toBeNull();
    expect(repo.codigosDe('u1')).toEqual([]);
    expect(await repo.sesionPorHash('a')).toBeNull();
  });
});
