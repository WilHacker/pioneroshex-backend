import {
  RepositorioCuentas,
  type SesionGuardada,
  type UsuarioGuardado,
} from './repositorio-cuentas.js';

/** Cuentas en memoria: para las pruebas y para arrancar sin base de datos. */
export class RepositorioCuentasMemoria extends RepositorioCuentas {
  private readonly usuarios = new Map<string, UsuarioGuardado>();
  private readonly sesiones = new Map<string, SesionGuardada>();
  private readonly codigos = new Map<string, { hash: string; usado: boolean }[]>();

  crearUsuario(usuario: UsuarioGuardado): Promise<boolean> {
    const repetido = [...this.usuarios.values()].some((u) => u.nombreNorm === usuario.nombreNorm);
    if (!repetido) this.usuarios.set(usuario.id, usuario);
    return Promise.resolve(!repetido);
  }

  usuarioPorNombre(nombreNorm: string): Promise<UsuarioGuardado | null> {
    const usuario = [...this.usuarios.values()].find((u) => u.nombreNorm === nombreNorm);
    return Promise.resolve(usuario ?? null);
  }

  usuarioPorId(id: string): Promise<UsuarioGuardado | null> {
    return Promise.resolve(this.usuarios.get(id) ?? null);
  }

  borrarUsuario(id: string): Promise<void> {
    this.usuarios.delete(id);
    this.codigos.delete(id);
    return this.borrarSesionesDe(id);
  }

  guardarSesion(sesion: SesionGuardada): Promise<void> {
    this.sesiones.set(sesion.tokenHash, sesion);
    return Promise.resolve();
  }

  sesionPorHash(tokenHash: string): Promise<SesionGuardada | null> {
    return Promise.resolve(this.sesiones.get(tokenHash) ?? null);
  }

  renovarSesion(tokenHash: string, expiraEn: number): Promise<void> {
    const sesion = this.sesiones.get(tokenHash);
    if (sesion) this.sesiones.set(tokenHash, { ...sesion, expiraEn });
    return Promise.resolve();
  }

  borrarSesion(tokenHash: string): Promise<void> {
    this.sesiones.delete(tokenHash);
    return Promise.resolve();
  }

  borrarSesionesDe(usuarioId: string): Promise<void> {
    for (const [hash, sesion] of this.sesiones) {
      if (sesion.usuarioId === usuarioId) this.sesiones.delete(hash);
    }
    return Promise.resolve();
  }

  borrarSesionesVencidas(ahora: number): Promise<void> {
    for (const [hash, sesion] of this.sesiones) {
      if (sesion.expiraEn <= ahora) this.sesiones.delete(hash);
    }
    return Promise.resolve();
  }

  actualizarContrasena(usuarioId: string, hashContrasena: string): Promise<void> {
    const usuario = this.usuarios.get(usuarioId);
    if (usuario) this.usuarios.set(usuarioId, { ...usuario, hashContrasena });
    return Promise.resolve();
  }

  reemplazarCodigos(usuarioId: string, hashes: readonly string[]): Promise<void> {
    this.codigos.set(
      usuarioId,
      hashes.map((hash) => ({ hash, usado: false })),
    );
    return Promise.resolve();
  }

  gastarCodigo(usuarioId: string, hash: string, _ahora: number): Promise<boolean> {
    const codigo = this.codigos.get(usuarioId)?.find((c) => c.hash === hash && !c.usado);
    if (!codigo) return Promise.resolve(false);
    codigo.usado = true;
    return Promise.resolve(true);
  }

  codigosSinUsar(usuarioId: string): Promise<number> {
    return Promise.resolve((this.codigos.get(usuarioId) ?? []).filter((c) => !c.usado).length);
  }

  /** Solo para pruebas: los hashes de los códigos guardados, usados o no. */
  codigosDe(usuarioId: string): readonly string[] {
    return (this.codigos.get(usuarioId) ?? []).map((c) => c.hash);
  }
}
