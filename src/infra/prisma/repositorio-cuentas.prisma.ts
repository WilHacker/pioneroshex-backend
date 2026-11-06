import { Inject, Injectable } from '@nestjs/common';
import {
  RepositorioCuentas,
  type SesionGuardada,
  type UsuarioGuardado,
} from '../cuentas/repositorio-cuentas.js';
import { PrismaService } from './prisma.service.js';

/** Código de error de Prisma para una restricción de unicidad violada. */
const ERROR_UNICO = 'P2002';

/** Guarda cuentas, sesiones y códigos de recuperación en PostgreSQL. */
@Injectable()
export class RepositorioCuentasPrisma extends RepositorioCuentas {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async crearUsuario(usuario: UsuarioGuardado): Promise<boolean> {
    try {
      await this.prisma.usuario.create({
        data: {
          id: usuario.id,
          nombre: usuario.nombre,
          nombreNorm: usuario.nombreNorm,
          hashContrasena: usuario.hashContrasena,
          creadoEn: new Date(usuario.creadoEn),
        },
      });
      return true;
    } catch (error: unknown) {
      // Dos registros a la vez con el mismo nombre: gana uno y el otro recibe `false`.
      if ((error as { code?: string }).code === ERROR_UNICO) return false;
      // El mensaje de Prisma puede incluir los datos de la consulta (el hash): no sale al log.
      // Sin `cause` a propósito: el error original puede llevar el hash de la contraseña.
      // oxlint-disable-next-line preserve-caught-error
      throw new Error('No se pudo guardar la cuenta nueva');
    }
  }

  async usuarioPorNombre(nombreNorm: string): Promise<UsuarioGuardado | null> {
    return aUsuario(await this.prisma.usuario.findUnique({ where: { nombreNorm } }));
  }

  async usuarioPorId(id: string): Promise<UsuarioGuardado | null> {
    return aUsuario(await this.prisma.usuario.findUnique({ where: { id } }));
  }

  async borrarUsuario(id: string): Promise<void> {
    // Las sesiones y los códigos se van con él (`onDelete: Cascade`).
    await this.prisma.usuario.deleteMany({ where: { id } });
  }

  async guardarSesion(sesion: SesionGuardada): Promise<void> {
    const datos = { usuarioId: sesion.usuarioId, expiraEn: new Date(sesion.expiraEn) };
    await this.prisma.sesion.upsert({
      where: { tokenHash: sesion.tokenHash },
      create: { tokenHash: sesion.tokenHash, ...datos },
      update: datos,
    });
  }

  async sesionPorHash(tokenHash: string): Promise<SesionGuardada | null> {
    const fila = await this.prisma.sesion.findUnique({ where: { tokenHash } });
    return fila
      ? { tokenHash: fila.tokenHash, usuarioId: fila.usuarioId, expiraEn: fila.expiraEn.getTime() }
      : null;
  }

  async renovarSesion(tokenHash: string, expiraEn: number): Promise<void> {
    // `updateMany` y no `upsert`: si la sesión ya se cerró, no se resucita.
    await this.prisma.sesion.updateMany({
      where: { tokenHash },
      data: { expiraEn: new Date(expiraEn) },
    });
  }

  async borrarSesion(tokenHash: string): Promise<void> {
    await this.prisma.sesion.deleteMany({ where: { tokenHash } });
  }

  async borrarSesionesDe(usuarioId: string): Promise<void> {
    await this.prisma.sesion.deleteMany({ where: { usuarioId } });
  }

  async borrarSesionesVencidas(ahora: number): Promise<void> {
    await this.prisma.sesion.deleteMany({ where: { expiraEn: { lte: new Date(ahora) } } });
  }

  async actualizarContrasena(usuarioId: string, hashContrasena: string): Promise<void> {
    try {
      await this.prisma.usuario.updateMany({ where: { id: usuarioId }, data: { hashContrasena } });
    } catch {
      // Igual que al crear: el error original podría llevar el hash.
      // oxlint-disable-next-line preserve-caught-error
      throw new Error('No se pudo cambiar la contraseña');
    }
  }

  async gastarCodigo(usuarioId: string, hash: string, ahora: number): Promise<boolean> {
    // La condición `usadoEn: null` hace el gasto atómico: dos intentos a la vez, solo uno gana.
    const { count } = await this.prisma.codigoRecuperacion.updateMany({
      where: { usuarioId, hash, usadoEn: null },
      data: { usadoEn: new Date(ahora) },
    });
    return count === 1;
  }

  codigosSinUsar(usuarioId: string): Promise<number> {
    return this.prisma.codigoRecuperacion.count({ where: { usuarioId, usadoEn: null } });
  }

  async reemplazarCodigos(usuarioId: string, hashes: readonly string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.codigoRecuperacion.deleteMany({ where: { usuarioId } }),
      this.prisma.codigoRecuperacion.createMany({
        data: hashes.map((hash) => ({ usuarioId, hash })),
      }),
    ]);
  }
}

function aUsuario(
  fila: {
    id: string;
    nombre: string;
    nombreNorm: string;
    hashContrasena: string;
    creadoEn: Date;
  } | null,
): UsuarioGuardado | null {
  return fila
    ? {
        id: fila.id,
        nombre: fila.nombre,
        nombreNorm: fila.nombreNorm,
        hashContrasena: fila.hashContrasena,
        creadoEn: fila.creadoEn.getTime(),
      }
    : null;
}
