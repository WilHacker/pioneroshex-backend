import {
  conUnDecimal,
  PARTIDAS_RECIENTES,
  RepositorioHistorial,
  type EstadisticasDeUsuario,
  type ResultadoDePartida,
} from './repositorio-historial.js';

/** Historial en memoria: para las pruebas y para arrancar sin base de datos. */
export class RepositorioHistorialMemoria extends RepositorioHistorial {
  private partidas = new Map<string, ResultadoDePartida>();

  registrar(resultado: ResultadoDePartida): Promise<boolean> {
    if (this.partidas.has(resultado.id)) return Promise.resolve(false);
    this.partidas.set(resultado.id, resultado);
    return Promise.resolve(true);
  }

  estadisticasDe(usuarioId: string): Promise<EstadisticasDeUsuario> {
    const mias = [...this.partidas.values()]
      .flatMap((p) =>
        p.participantes
          .filter((j) => j.usuarioId === usuarioId)
          .map((j) => ({
            partidaId: p.id,
            terminadaEn: p.terminadaEn,
            puntos: j.puntos,
            gano: j.gano,
            ganador: p.ganador,
            jugadores: p.participantes.length,
          })),
      )
      .toSorted((a, b) => b.terminadaEn - a.terminadaEn);
    const victorias = mias.filter((m) => m.gano).length;
    const suma = mias.reduce((total, m) => total + m.puntos, 0);
    return Promise.resolve({
      partidas: mias.length,
      victorias,
      promedioPuntos: mias.length === 0 ? 0 : conUnDecimal(suma / mias.length),
      ultimas: mias.slice(0, PARTIDAS_RECIENTES),
    });
  }

  desvincularUsuario(usuarioId: string): Promise<void> {
    this.partidas = new Map(
      [...this.partidas].map(([id, p]) => [
        id,
        {
          ...p,
          participantes: p.participantes.map((j) =>
            j.usuarioId === usuarioId ? { ...j, usuarioId: null } : j,
          ),
        },
      ]),
    );
    return Promise.resolve();
  }
}
