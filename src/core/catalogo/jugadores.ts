import { JUGADORES_MAX, JUGADORES_MIN } from '../partida/game-config.js';

/** Cada poblado inicial bloquea como mucho 4 vértices; cada jugador pone 2 (ver `crearGameConfig`). */
const VERTICES_BLOQUEADOS = 4;
const POBLADOS_INICIALES = 2;
/**
 * Espacio cómodo por jugador. Es una estimación (el 5-6 jugadores del juego de mesa ronda esa
 * cifra) y **no está probada jugando**: solo avisa, nunca impide.
 */
const VERTICES_POR_JUGADOR = 12;

/**
 * Máximo de jugadores para los que `crearGameConfig` acepta el mapa, sin el tope del juego: mismo
 * criterio (vértices > 4·(2n−1)). Con 54 vértices da 7 y con 96 da 12.
 */
export function maximoPorVertices(vertices: number): number {
  return (
    Math.ceil((vertices + VERTICES_BLOQUEADOS) / (VERTICES_BLOQUEADOS * POBLADOS_INICIALES)) - 1
  );
}

const acotar = (n: number): number => Math.min(JUGADORES_MAX, Math.max(JUGADORES_MIN, n));

/** Más jugadores que esto no pueden ni colocar sus poblados iniciales. */
export const maximoTecnico = (vertices: number): number => acotar(maximoPorVertices(vertices));

/** Hasta aquí hay espacio cómodo (unos 12 vértices por jugador). Nunca pasa del técnico. */
export const maximoRecomendado = (vertices: number): number =>
  Math.min(maximoTecnico(vertices), acotar(Math.floor(vertices / VERTICES_POR_JUGADOR)));

/** Con menos de la mitad del recomendado el mapa queda demasiado vacío. */
export const minimoRecomendado = (vertices: number): number =>
  Math.max(JUGADORES_MIN, Math.ceil(maximoRecomendado(vertices) / 2));

export type Aptitud = 'RECOMENDADO' | 'JUSTO' | 'NO';

/**
 * Qué tal le va a un mapa con `jugadores`: RECOMENDADO en su rango cómodo, JUSTO si se puede pero
 * sobra o falta espacio (el selector solo avisa) y NO si no caben los poblados iniciales.
 */
export function aptitudParaJugadores(vertices: number, jugadores: number): Aptitud {
  if (!Number.isInteger(jugadores) || jugadores < JUGADORES_MIN || jugadores > JUGADORES_MAX) {
    return 'NO';
  }
  if (jugadores > maximoTecnico(vertices)) return 'NO';
  const comodo =
    jugadores >= minimoRecomendado(vertices) && jugadores <= maximoRecomendado(vertices);
  return comodo ? 'RECOMENDADO' : 'JUSTO';
}
