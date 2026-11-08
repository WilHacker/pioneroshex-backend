import { clave, type Hex } from '../mapa/coordenadas.js';
import { PUNTOS_LADRON_AMISTOSO } from '../partida/game-config.js';
import { RECURSOS } from '../reglas/recursos.js';
import type { Mesa } from './mesa.js';
import { puntosPublicosDe } from './puntos.js';
import type { Estado, JugadorId } from './tipos.js';

/**
 * A quién puede robar `jugador` al poner el ladrón en `destino`: rivales con un edificio en un
 * vértice de esa casilla y al menos una carta en mano, en el orden de los vértices del mapa.
 * Con «ladrón amistoso» quedan fuera quienes tienen menos de `PUNTOS_LADRON_AMISTOSO` puntos
 * públicos (los ocultos no cuentan: si contaran, se podrían deducir).
 */
export function victimasPosibles(
  mesa: Mesa,
  estado: Estado,
  jugador: JugadorId,
  destino: Hex,
): JugadorId[] {
  const claveDestino = clave(destino);
  const duenos = new Set<JugadorId>();
  for (const vertice of mesa.mapa.vertices) {
    if (!vertice.casillas.some((c) => clave(c) === claveDestino)) continue;
    const edificio = estado.edificios[vertice.id];
    if (edificio && edificio.dueno !== jugador) duenos.add(edificio.dueno);
  }
  return [...duenos].filter((id) => {
    const rival = estado.jugadores.find((j) => j.id === id);
    if (rival === undefined || !RECURSOS.some((r) => rival.recursos[r] > 0)) return false;
    return !estado.config.ladronAmistoso || puntosPublicosDe(estado, id) >= PUNTOS_LADRON_AMISTOSO;
  });
}
