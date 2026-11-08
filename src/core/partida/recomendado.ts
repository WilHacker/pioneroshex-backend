import { JUGADORES_MAX, JUGADORES_MIN, type ModoDados, type TurnRuleMode } from './game-config.js';

/** Los ajustes de la sala que dependen de cuántos juegan. Todos los acepta `PATCH /salas/:id`. */
export interface Recomendado {
  readonly puntosVictoria: number;
  /** 0 es sin límite; si no, uno de `TIEMPOS_DE_TURNO`. */
  readonly turnoSegundos: number;
  readonly robberHandLimit: number;
  readonly turnRuleMode: TurnRuleMode;
  readonly modoDados: ModoDados;
}

/** Hasta aquí el juego es el clásico (turnos A, 10 puntos). */
const JUGADORES_CLASICO = 4;
/** El modo B (construcción especial) existe desde aquí. */
const JUGADORES_MODO_B = 5;
/** Desde aquí se guarda más mano antes de descartar (el mapa es más grande). */
const JUGADORES_MANO_GRANDE = 7;

/**
 * Valores de partida, pensados para que la partida no se alargue de más: con más jugadores el
 * mapa y la espera entre turnos crecen, así que se piden más puntos y turnos más cortos.
 * Son una propuesta editable por el anfitrión; ajustar aquí tras jugar partidas reales.
 */
const POR_TRAMO = [
  { hasta: 4, puntosVictoria: 10, turnoSegundos: 90 },
  { hasta: 6, puntosVictoria: 12, turnoSegundos: 60 },
  { hasta: 8, puntosVictoria: 14, turnoSegundos: 60 },
  { hasta: 10, puntosVictoria: 16, turnoSegundos: 30 },
  { hasta: JUGADORES_MAX, puntosVictoria: 18, turnoSegundos: 30 },
] as const;

/** Qué conviene para una sala de `jugadores`. Lanza `RangeError` si el número no es posible. */
export function recomendadoPara(jugadores: number): Recomendado {
  if (!Number.isInteger(jugadores) || jugadores < JUGADORES_MIN || jugadores > JUGADORES_MAX) {
    throw new RangeError(
      `El número de jugadores debe ser un entero entre ${JUGADORES_MIN} y ${JUGADORES_MAX}, no ${jugadores}`,
    );
  }
  const tramo = POR_TRAMO.find((t) => jugadores <= t.hasta) ?? POR_TRAMO[POR_TRAMO.length - 1]!;
  return {
    puntosVictoria: tramo.puntosVictoria,
    turnoSegundos: tramo.turnoSegundos,
    robberHandLimit: jugadores >= JUGADORES_MANO_GRANDE ? 9 : 7,
    turnRuleMode: jugadores >= JUGADORES_MODO_B ? 'B' : 'A',
    modoDados: jugadores > JUGADORES_CLASICO ? 'EQUILIBRADO' : 'AZAR',
  };
}
