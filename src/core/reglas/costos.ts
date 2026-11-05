import { JUGADORES_MAX, JUGADORES_MIN } from '../partida/game-config.js';
import type { Recurso } from './recursos.js';

export type Costo = Readonly<Partial<Record<Recurso, number>>>;
export type Pieza = 'CAMINO' | 'POBLADO' | 'CIUDAD' | 'CARTA';

const congelar = (costo: Costo): Costo => Object.freeze({ ...costo });

export const COSTOS: Readonly<Record<Pieza, Costo>> = Object.freeze({
  CAMINO: congelar({ MADERA: 1, LADRILLO: 1 }),
  POBLADO: congelar({ MADERA: 1, LADRILLO: 1, OVEJA: 1, TRIGO: 1 }),
  CIUDAD: congelar({ TRIGO: 2, MINERAL: 3 }),
  CARTA: congelar({ OVEJA: 1, TRIGO: 1, MINERAL: 1 }),
});

export interface LimitesDePiezas {
  readonly caminos: number;
  readonly poblados: number;
  readonly ciudades: number;
}

// Valores del juego clásico (3-4) y de la ampliación (5-6); para 7+ se toma el extremo alto
// del rango del informe (caminos 25, poblados 8, ciudades 6). Provisional: ajustar jugando.
const LIMITES_2_A_4: LimitesDePiezas = { caminos: 15, poblados: 5, ciudades: 4 };
const LIMITES_5_A_6: LimitesDePiezas = { caminos: 20, poblados: 7, ciudades: 5 };
const LIMITES_7_O_MAS: LimitesDePiezas = { caminos: 25, poblados: 8, ciudades: 6 };

/** Piezas que tiene cada jugador en su reserva, según cuántos juegan. */
export function limitesDePiezas(jugadores: number): LimitesDePiezas {
  if (!Number.isInteger(jugadores) || jugadores < JUGADORES_MIN || jugadores > JUGADORES_MAX) {
    throw new Error(
      `El número de jugadores debe ser un entero entre ${JUGADORES_MIN} y ${JUGADORES_MAX}, no ${jugadores}`,
    );
  }
  if (jugadores <= 4) return LIMITES_2_A_4;
  if (jugadores <= 6) return LIMITES_5_A_6;
  return LIMITES_7_O_MAS;
}
