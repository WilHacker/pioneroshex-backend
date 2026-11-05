import type { Hex } from '../mapa/coordenadas.js';
import type { GameConfig } from '../partida/game-config.js';
import type { LimitesDePiezas } from '../reglas/costos.js';
import { RECURSOS, type Recurso } from '../reglas/recursos.js';
import { puntosDe } from './puntos.js';
import type { Estado, Fase, JugadorId } from './tipos.js';

export interface VistaJugador {
  readonly id: JugadorId;
  readonly piezasRestantes: LimitesDePiezas;
  readonly totalCartas: number;
  readonly puntos: number;
  /** Solo la mano del observador; `null` en las ajenas y para el espectador. */
  readonly recursos: Readonly<Record<Recurso, number>> | null;
}

export interface Vista {
  /** Sin `semilla`: de ella sale todo el azar, y revelarla permitiría predecir dados y mazo. */
  readonly config: Omit<GameConfig, 'semilla'>;
  readonly yo: JugadorId | null;
  readonly jugadores: readonly VistaJugador[];
  readonly fase: Fase;
  /** Id del jugador en turno; `null` con la partida terminada (fase FIN), ya no hay turno. */
  readonly turnoDe: JugadorId | null;
  readonly edificios: Estado['edificios'];
  readonly caminos: Estado['caminos'];
  readonly banco: Estado['banco'];
  readonly ladron: Hex | null;
  readonly dados: Estado['dados'];
  readonly ganador: JugadorId | null;
  readonly version: number;
}

/**
 * Lo que puede ver `jugadorId` (o un espectador si es `null`). El servidor es autoritativo:
 * las manos ajenas nunca salen de aquí. Todo se copia; la vista no comparte referencias.
 */
export function vistaPara(estado: Estado, jugadorId: JugadorId | null): Vista {
  if (jugadorId !== null && !estado.jugadores.some((j) => j.id === jugadorId)) {
    throw new Error(`El jugador "${jugadorId}" no participa en la partida`);
  }
  const { semilla: _oculta, ...configPublica } = estado.config;
  const jugadores = estado.jugadores.map((j): VistaJugador => ({
    id: j.id,
    piezasRestantes: { ...j.piezasRestantes },
    totalCartas: RECURSOS.reduce((total, r) => total + j.recursos[r], 0),
    puntos: puntosDe(estado, j.id),
    recursos: j.id === jugadorId ? { ...j.recursos } : null,
  }));
  return {
    config: configPublica,
    yo: jugadorId,
    jugadores,
    fase: estado.fase,
    turnoDe: estado.fase === 'FIN' ? null : (estado.jugadores[estado.turnoDe]?.id ?? null),
    edificios: Object.fromEntries(Object.entries(estado.edificios).map(([v, e]) => [v, { ...e }])),
    caminos: { ...estado.caminos },
    banco: { ...estado.banco },
    ladron: estado.ladron && { ...estado.ladron },
    dados: estado.dados && [estado.dados[0], estado.dados[1]],
    ganador: estado.ganador,
    version: estado.version,
  };
}
