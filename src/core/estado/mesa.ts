import { crearMapa, type Arista, type Mapa, type Vertice } from '../mapa/mapa.js';
import type { GameConfig } from '../partida/game-config.js';
import { generarPuertos, type Puerto } from '../reglas/puertos.js';
import { generarTablero, type Tablero } from '../reglas/tablero.js';

/** Parte fija de la partida (no cambia con las jugadas): geometría, terrenos y puertos. */
export interface Mesa {
  readonly config: GameConfig;
  readonly mapa: Mapa;
  readonly tablero: Tablero;
  readonly puertos: readonly Puerto[];
  vertice(id: string): Vertice | undefined;
  arista(id: string): Arista | undefined;
}

export function crearMesa(config: GameConfig): Mesa {
  const mapa = crearMapa(config.radio);
  const vertices = new Map(mapa.vertices.map((v) => [v.id, v]));
  const aristas = new Map(mapa.aristas.map((a) => [a.id, a]));
  return {
    config,
    mapa,
    tablero: generarTablero(mapa, config.semilla),
    puertos: generarPuertos(mapa, config.semilla),
    vertice: (id) => vertices.get(id),
    arista: (id) => aristas.get(id),
  };
}
