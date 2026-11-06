export interface UsuarioGuardado {
  readonly id: string;
  /** Como lo escribió la persona. */
  readonly nombre: string;
  /** Minúsculas: dos nombres que solo difieren en mayúsculas son el mismo. Es único. */
  readonly nombreNorm: string;
  /** `scrypt$N$r$p$sal$clave`: nunca la contraseña. */
  readonly hashContrasena: string;
  /** Milisegundos desde la época. */
  readonly creadoEn: number;
}

export interface SesionGuardada {
  /** SHA-256 del token de la cookie: el token en claro solo lo tiene el navegador. */
  readonly tokenHash: string;
  readonly usuarioId: string;
  readonly expiraEn: number;
}

/** Puerto de salida: dónde viven las cuentas, sus sesiones y sus códigos de recuperación. */
export abstract class RepositorioCuentas {
  /** `false` si ya existe un usuario con ese `nombreNorm` (sin crear nada). */
  abstract crearUsuario(usuario: UsuarioGuardado): Promise<boolean>;
  abstract usuarioPorNombre(nombreNorm: string): Promise<UsuarioGuardado | null>;
  abstract usuarioPorId(id: string): Promise<UsuarioGuardado | null>;
  /** Borra la cuenta con sus sesiones y códigos. */
  abstract borrarUsuario(id: string): Promise<void>;

  abstract guardarSesion(sesion: SesionGuardada): Promise<void>;
  abstract sesionPorHash(tokenHash: string): Promise<SesionGuardada | null>;
  /** Solo cambia la caducidad si la sesión sigue existiendo: nunca la vuelve a crear. */
  abstract renovarSesion(tokenHash: string, expiraEn: number): Promise<void>;
  abstract borrarSesion(tokenHash: string): Promise<void>;
  abstract borrarSesionesDe(usuarioId: string): Promise<void>;
  abstract borrarSesionesVencidas(ahora: number): Promise<void>;

  abstract actualizarContrasena(usuarioId: string, hashContrasena: string): Promise<void>;

  /** Sustituye todos los códigos de la cuenta (los anteriores dejan de servir). */
  abstract reemplazarCodigos(usuarioId: string, hashes: readonly string[]): Promise<void>;
  /** Marca el código como usado. `true` solo la primera vez y solo si existe y es de esa cuenta. */
  abstract gastarCodigo(usuarioId: string, hash: string, ahora: number): Promise<boolean>;
  abstract codigosSinUsar(usuarioId: string): Promise<number>;
}
