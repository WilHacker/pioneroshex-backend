import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { Estado } from '../../core/estado/tipos.js';
import {
  RepositorioSalas,
  type JugadorDeSala,
  type SalaGuardada,
} from '../salas/repositorio-salas.js';
import { PrismaService } from './prisma.service.js';

/** Guarda las salas en PostgreSQL; `jugadores` y `estado` van como JSON. */
@Injectable()
export class RepositorioSalasPrisma extends RepositorioSalas {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async guardar(sala: SalaGuardada): Promise<void> {
    const datos = {
      anfitrion: sala.anfitrion,
      jugadores: sala.jugadores as unknown as Prisma.InputJsonValue,
      partidaId: sala.partidaId,
      publica: sala.publica,
      opciones: sala.opciones as unknown as Prisma.InputJsonValue,
      estado:
        sala.estado === null ? Prisma.JsonNull : (sala.estado as unknown as Prisma.InputJsonValue),
      actualizadaEn: new Date(sala.actualizadaEn),
    };
    await this.prisma.sala.upsert({
      where: { id: sala.id },
      create: { id: sala.id, ...datos },
      update: datos,
    });
  }

  async cargarTodas(): Promise<SalaGuardada[]> {
    const filas = await this.prisma.sala.findMany();
    return filas.map((fila) => ({
      id: fila.id,
      anfitrion: fila.anfitrion,
      jugadores: fila.jugadores as unknown as JugadorDeSala[],
      partidaId: fila.partidaId,
      publica: fila.publica,
      opciones: (fila.opciones ?? {}) as Record<string, unknown>,
      estado: fila.estado as unknown as Estado | null,
      actualizadaEn: fila.actualizadaEn.getTime(),
    }));
  }

  async eliminar(id: string): Promise<void> {
    await this.prisma.sala.deleteMany({ where: { id } });
  }
}
