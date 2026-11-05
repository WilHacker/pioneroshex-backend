import { validarDistancia } from '../reglas/distancia.js';
import type { Mesa } from './mesa.js';
import type { Estado, JugadorId, ResultadoRegla } from './tipos.js';

/** Vértices que toca al menos un camino del jugador (índice local por llamada). */
function verticesConCaminoPropio(mesa: Mesa, estado: Estado, jugador: JugadorId): Set<string> {
  const tocados = new Set<string>();
  for (const [aristaId, dueno] of Object.entries(estado.caminos)) {
    if (dueno !== jugador) continue;
    mesa.arista(aristaId)?.vertices.forEach((v) => tocados.add(v));
  }
  return tocados;
}

/**
 * Poblado: regla de la distancia y, si `requiereCamino`, un camino propio que toque el vértice.
 * No mira turno, fase, piezas ni recursos.
 */
export function puedeColocarPoblado(
  mesa: Mesa,
  estado: Estado,
  jugador: JugadorId,
  vertice: string,
  opciones: { requiereCamino: boolean },
): ResultadoRegla {
  const distancia = validarDistancia(mesa.mapa, new Set(Object.keys(estado.edificios)), vertice);
  if (!distancia.ok) {
    const culpable = distancia.detalle?.vecinoOcupado ?? vertice;
    const dueno = estado.edificios[culpable]?.dueno;
    return {
      ok: false,
      motivo: distancia.motivo,
      ...(distancia.motivo === 'VERTICE_INEXISTENTE'
        ? {}
        : { detalle: { ...distancia.detalle, ...(dueno ? { dueno } : {}) } }),
    };
  }
  if (opciones.requiereCamino && !verticesConCaminoPropio(mesa, estado, jugador).has(vertice)) {
    return { ok: false, motivo: 'SIN_CONEXION' };
  }
  return { ok: true };
}

/**
 * Camino: arista existente y libre, con un extremo que conecta: edificio propio, o sin edificio
 * rival y con otro camino propio. Un edificio rival en un extremo con camino propio es un corte.
 */
export function puedeColocarCamino(
  mesa: Mesa,
  estado: Estado,
  jugador: JugadorId,
  arista: string,
): ResultadoRegla {
  const datos = mesa.arista(arista);
  if (!datos) return { ok: false, motivo: 'ARISTA_INEXISTENTE' };
  const duenoCamino = estado.caminos[arista];
  if (duenoCamino !== undefined) {
    return { ok: false, motivo: 'ARISTA_OCUPADA', detalle: { dueno: duenoCamino } };
  }

  const propios = verticesConCaminoPropio(mesa, estado, jugador);
  let corte: { vertice: string; dueno: string } | null = null;
  for (const v of datos.vertices) {
    const edificio = estado.edificios[v];
    if (edificio?.dueno === jugador) return { ok: true };
    if (!edificio && propios.has(v)) return { ok: true };
    if (edificio && propios.has(v)) corte ??= { vertice: v, dueno: edificio.dueno };
  }
  return corte
    ? {
        ok: false,
        motivo: 'CAMINO_CORTADO',
        detalle: { verticeCortado: corte.vertice, dueno: corte.dueno },
      }
    : { ok: false, motivo: 'SIN_CONEXION' };
}
