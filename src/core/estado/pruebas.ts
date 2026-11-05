// Utilidades solo para tests: excluidas de la cobertura y del build.
import {
  crearGameConfig,
  type GameConfig,
  type GameConfigEntrada,
} from '../partida/game-config.js';
import type { CasillaTablero } from '../reglas/tablero.js';
import { crearMesa, type Mesa } from './mesa.js';
import type { Estado } from './tipos.js';

/**
 * Semilla del azar de prueba para una del mapa: `AZAR-<semilla>`. Si la del mapa fuera un prefijo
 * de esa (`A`, `AZ`, `AZAR-`...), `crearGameConfig` la rechazaría por derivada; entonces se antepone
 * `#`, que nunca es la primera letra de una semilla que empiece con `A`.
 */
function azarDePrueba(semilla: string): string {
  const base = `AZAR-${semilla}`;
  return base.startsWith(semilla) ? `#${base}` : base;
}

/**
 * Configuración de prueba. `semilla` es un atajo SOLO para tests: fija la del mapa y una del azar
 * independiente de ella. En producción la `semillaAzar` la da el servidor.
 */
export function configDePrueba(
  entrada: Partial<GameConfigEntrada> & { readonly semilla?: string } = {},
): GameConfig {
  const { semilla = 'PRUEBA', ...resto } = entrada;
  return crearGameConfig({
    semillaMapa: semilla,
    semillaAzar: azarDePrueba(semilla),
    jugadores: 4,
    ...resto,
  });
}

export function mesaDePrueba(
  opciones: Partial<GameConfigEntrada> & { readonly semilla?: string } = {},
): Mesa {
  return crearMesa(configDePrueba(opciones));
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
