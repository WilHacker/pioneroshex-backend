import type { Mapa } from '../mapa/mapa.js';

export type MotivoRechazo = 'VERTICE_INEXISTENTE' | 'VERTICE_OCUPADO' | 'DEMASIADO_CERCA';

export type Validacion =
  { readonly ok: true } | { readonly ok: false; readonly motivo: MotivoRechazo };

/**
 * Regla de la distancia: un poblado solo va en un vértice vacío cuyos vecinos no tengan poblado ni
 * ciudad, de cualquier jugador. `ocupados` son los vértices con poblado o ciudad.
 * No mira caminos ni recursos: eso lo validan otras reglas.
 */
export function validarDistancia(
  mapa: Mapa,
  ocupados: ReadonlySet<string>,
  verticeId: string,
): Validacion {
  // ponytail: búsqueda lineal; indexar el mapa por id si el costo se nota con mapas muy grandes.
  const vertice = mapa.vertices.find((v) => v.id === verticeId);
  if (!vertice) return { ok: false, motivo: 'VERTICE_INEXISTENTE' };
  if (ocupados.has(verticeId)) return { ok: false, motivo: 'VERTICE_OCUPADO' };
  if (vertice.vecinos.some((id) => ocupados.has(id))) {
    return { ok: false, motivo: 'DEMASIADO_CERCA' };
  }
  return { ok: true };
}
