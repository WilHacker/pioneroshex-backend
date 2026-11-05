// Utilidades solo para tests: excluidas de la cobertura y del build.
import { crearGameConfig, type GameConfig } from '../partida/game-config.js';
import type { CasillaTablero } from '../reglas/tablero.js';
import { crearMesa, type Mesa } from './mesa.js';
import type { Estado } from './tipos.js';

export function mesaDePrueba(opciones: Partial<GameConfig> = {}): Mesa {
  return crearMesa(crearGameConfig({ semilla: 'PRUEBA', jugadores: 4, ...opciones }));
}

/** Id de la arista que une dos vértices vecinos; falla si no existe. */
export function aristaEntre(mesa: Mesa, a: string, b: string): string {
  const arista = mesa.mapa.aristas.find((x) => x.vertices.includes(a) && x.vertices.includes(b));
  if (!arista) throw new Error(`No hay arista entre ${a} y ${b}`);
  return arista.id;
}

export function casillaConFicha(mesa: Mesa, ficha: number): CasillaTablero | undefined {
  return mesa.tablero.casillas.find((c) => c.ficha === ficha);
}

export function conCambios(estado: Estado, cambios: Partial<Estado>): Estado {
  return { ...estado, ...cambios };
}
