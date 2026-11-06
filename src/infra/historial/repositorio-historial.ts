export interface ParticipanteDePartida {
  /** `null` para los invitados: de ellos no se guarda más que el nombre que usaron. */
  readonly usuarioId: string | null;
  readonly nombre: string;
  readonly puntos: number;
  readonly gano: boolean;
}

/** El resultado de una partida terminada. */
export interface ResultadoDePartida {
  /** El id de la sala: una partida se registra una sola vez. */
  readonly id: string;
  /** Milisegundos desde la época. */
  readonly terminadaEn: number;
  readonly puntosVictoria: number;
  readonly ganador: string;
  readonly participantes: readonly ParticipanteDePartida[];
}

export interface PartidaDeUsuario {
  readonly partidaId: string;
  readonly terminadaEn: number;
  readonly puntos: number;
  readonly gano: boolean;
  readonly ganador: string;
  readonly jugadores: number;
}

export interface EstadisticasDeUsuario {
  readonly partidas: number;
  readonly victorias: number;
  /** Con un decimal; 0 si todavía no ha jugado. */
  readonly promedioPuntos: number;
  /** Las más recientes primero (hasta 10). */
  readonly ultimas: readonly PartidaDeUsuario[];
}

/** Puerto de salida: dónde viven los resultados de las partidas. */
export abstract class RepositorioHistorial {
  /** `false` si esa partida ya estaba registrada (no se duplica nada). */
  abstract registrar(resultado: ResultadoDePartida): Promise<boolean>;
  abstract estadisticasDe(usuarioId: string): Promise<EstadisticasDeUsuario>;
  /** Al borrar una cuenta: sus participaciones pasan a ser anónimas. */
  abstract desvincularUsuario(usuarioId: string): Promise<void>;
}

export const PARTIDAS_RECIENTES = 10;

/** Un decimal, para que el perfil muestre «7,3» y no «7,333333». */
export const conUnDecimal = (valor: number): number => Math.round(valor * 10) / 10;
