import { Inject, Injectable } from '@nestjs/common';
import {
  conUnDecimal,
  PARTIDAS_RECIENTES,
  RepositorioHistorial,
  type EstadisticasDeUsuario,
  type ResultadoDePartida,
} from '../historial/repositorio-historial.js';
import { PrismaService } from './prisma.service.js';

const ERROR_UNICO = 'P2002';

/** Guarda los resultados de las partidas en PostgreSQL. */
@Injectable()
export class RepositorioHistorialPrisma extends RepositorioHistorial {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async registrar(resultado: ResultadoDePartida): Promise<boolean> {
    // Si alguien borró su cuenta mientras jugaba, su participación se guarda sin dueño.
    const ids = resultado.participantes.flatMap((j) => (j.usuarioId === null ? [] : [j.usuarioId]));
    const existentes = new Set(
      (
        await this.prisma.usuario.findMany({ where: { id: { in: ids } }, select: { id: true } })
      ).map((u) => u.id),
    );
    try {
      await this.prisma.partida.create({
        data: {
          id: resultado.id,
          terminadaEn: new Date(resultado.terminadaEn),
          puntosVictoria: resultado.puntosVictoria,
          jugadores: resultado.participantes.length,
          ganador: resultado.ganador,
          participaciones: {
            create: resultado.participantes.map((j, posicion) => ({
              posicion,
              usuarioId: j.usuarioId !== null && existentes.has(j.usuarioId) ? j.usuarioId : null,
              nombre: j.nombre,
              puntos: j.puntos,
              gano: j.gano,
            })),
          },
        },
      });
      return true;
    } catch (error: unknown) {
      // Ya estaba registrada (por ejemplo, tras reiniciar el servidor): no es un error.
      if ((error as { code?: string }).code === ERROR_UNICO) return false;
      throw error;
    }
  }

  async estadisticasDe(usuarioId: string): Promise<EstadisticasDeUsuario> {
    const [total, victorias, promedio, recientes] = await Promise.all([
      this.prisma.participacion.count({ where: { usuarioId } }),
      this.prisma.participacion.count({ where: { usuarioId, gano: true } }),
      // El nombre `_avg` lo impone la API de Prisma.
      // oxlint-disable-next-line no-underscore-dangle
      this.prisma.participacion.aggregate({ where: { usuarioId }, _avg: { puntos: true } }),
      this.prisma.participacion.findMany({
        where: { usuarioId },
        include: { partida: true },
        orderBy: { partida: { terminadaEn: 'desc' } },
        take: PARTIDAS_RECIENTES,
      }),
    ]);
    return {
      partidas: total,
      victorias,
      // oxlint-disable-next-line no-underscore-dangle
      promedioPuntos: conUnDecimal(promedio._avg.puntos ?? 0),
      ultimas: recientes.map((r) => ({
        partidaId: r.partidaId,
        terminadaEn: r.partida.terminadaEn.getTime(),
        puntos: r.puntos,
        gano: r.gano,
        ganador: r.partida.ganador,
        jugadores: r.partida.jugadores,
      })),
    };
  }

  async desvincularUsuario(usuarioId: string): Promise<void> {
    await this.prisma.participacion.updateMany({ where: { usuarioId }, data: { usuarioId: null } });
  }
}
