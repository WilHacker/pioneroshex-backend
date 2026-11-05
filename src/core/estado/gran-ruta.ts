import type { Arista } from '../mapa/mapa.js';
import type { Mesa } from './mesa.js';
import type { Estado, JugadorId } from './tipos.js';

export const LONGITUD_MINIMA_GRAN_RUTA = 5;

const getOtroVertice = (arista: Arista, v: string): string =>
  arista.vertices[0] === v ? arista.vertices[1]! : arista.vertices[0]!;

/** Calcula la longitud del camino continuo más largo de un jugador. */
export function calcularLongitudCamino(mesa: Mesa, estado: Estado, jugador: JugadorId): number {
  const caminosPropios = new Set<string>();
  for (const [id, dueno] of Object.entries(estado.caminos)) {
    if (dueno === jugador) caminosPropios.add(id);
  }

  if (caminosPropios.size === 0) return 0;

  // Mapa de vértice -> aristas propias incidentes
  const aristasPorVertice = new Map<string, string[]>();
  for (const aristaId of caminosPropios) {
    const arista = mesa.arista(aristaId);
    if (!arista) continue;
    for (const v of arista.vertices) {
      const lista = aristasPorVertice.get(v) ?? [];
      lista.push(aristaId);
      aristasPorVertice.set(v, lista);
    }
  }

  const esVerticeBloqueado = (v: string): boolean => {
    const edificio = estado.edificios[v];
    return Boolean(edificio && edificio.dueno !== jugador);
  };

  let maximaLongitud = 0;
  const visitadas = new Set<string>();

  function dfs(verticeActual: string): number {
    let maxSub = 0;
    const incidentes = aristasPorVertice.get(verticeActual) ?? [];
    for (const aristaId of incidentes) {
      if (visitadas.has(aristaId)) continue;
      const arista = mesa.arista(aristaId);
      if (!arista) continue;

      visitadas.add(aristaId);
      const siguienteVertice = getOtroVertice(arista, verticeActual);

      let len = 1;
      // Solo continúa si el siguiente vértice no está bloqueado por un rival
      if (!esVerticeBloqueado(siguienteVertice)) {
        len = 1 + dfs(siguienteVertice);
      }
      visitadas.delete(aristaId);

      if (len > maxSub) maxSub = len;
    }
    return maxSub;
  }

  // Exploramos desde todos los vértices con aristas propias
  for (const v of aristasPorVertice.keys()) {
    const len = dfs(v);
    if (len > maximaLongitud) maximaLongitud = len;
  }

  return maximaLongitud;
}

export interface ResultadoGranRuta {
  readonly titular: JugadorId | null;
  readonly longitud: number;
}

/**
 * Evalúa quién ostenta la Gran Ruta Comercial según las reglas oficiales de Catan:
 * - Mínimo 5 caminos continuos.
 * - Para arrebatársela al titular actual, se debe superar estrictamente su longitud.
 * - Si el titular actual cae por debajo de 5 (por corte), pasa al mejor con >= 5 o queda vacante.
 */
export function evaluarGranRuta(
  mesa: Mesa,
  estado: Estado,
  longitudesPrecalculadas?: Partial<Record<JugadorId, number>>,
): ResultadoGranRuta {
  const longitudes: Record<JugadorId, number> = {};
  for (const j of estado.jugadores) {
    longitudes[j.id] =
      longitudesPrecalculadas?.[j.id] ?? calcularLongitudCamino(mesa, estado, j.id);
  }

  const titularActual = estado.granRuta;
  const longitudActual = titularActual ? (longitudes[titularActual] ?? 0) : 0;

  // Caso 1: El titular actual conserva al menos 5 caminos
  if (titularActual && longitudActual >= LONGITUD_MINIMA_GRAN_RUTA) {
    let nuevoTitular = titularActual;
    let mejorLongitud = longitudActual;

    for (const j of estado.jugadores) {
      if (j.id === titularActual) continue;
      const l = longitudes[j.id]!;
      // Debe superar estrictamente
      if (l > mejorLongitud) {
        nuevoTitular = j.id;
        mejorLongitud = l;
      }
    }

    return { titular: nuevoTitular, longitud: mejorLongitud };
  }

  // Caso 2: No hay titular o el titular actual cayó por debajo de 5
  let mejorJugador: JugadorId | null = null;
  let mejorLongitud = 0;

  for (const j of estado.jugadores) {
    const l = longitudes[j.id]!;
    if (l >= LONGITUD_MINIMA_GRAN_RUTA && l > mejorLongitud) {
      mejorJugador = j.id;
      mejorLongitud = l;
    }
  }

  return { titular: mejorJugador, longitud: mejorLongitud };
}
