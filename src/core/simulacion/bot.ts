import { uniformInt } from 'pure-rand/distribution/uniformInt';
import type { Accion } from '../estado/tipos.js';
import type { Rng } from '../reglas/azar.js';

/** De mayor a menor prioridad; lo que no está aquí (tirar, preparación, terminar) va al final. */
const PRIORIDAD: readonly Accion['tipo'][] = [
  'CONSTRUIR_CIUDAD',
  'CONSTRUIR_POBLADO',
  'JUGAR_CABALLERO',
  'JUGAR_CONSTRUCCION_CARRETERAS',
  'JUGAR_ABUNDANCIA',
  'JUGAR_MONOPOLIO',
  'COMPRAR_CARTA_DESARROLLO',
  'CONSTRUIR_CAMINO',
];
/** Probabilidad, en %, de terminar el turno antes aunque se pueda construir. */
const PROB_TERMINAR_ANTES = 20;

const azar = <T>(items: readonly T[], rng: Rng): T => items[uniformInt(rng, 0, items.length - 1)]!;

/**
 * Bot simple: ciudad > poblado > camino > el resto, al azar dentro del grupo más alto; con un 20 %
 * termina el turno antes si puede. Avanza `rng` (es su flujo propio de azar).
 */
export function elegirAccion(acciones: readonly Accion[], rng: Rng): Accion {
  if (acciones.length === 0) throw new Error('El bot se quedó sin acciones legales');
  const terminar = acciones.find((a) => a.tipo === 'TERMINAR_TURNO');
  if (terminar && uniformInt(rng, 1, 100) <= PROB_TERMINAR_ANTES) return terminar;
  for (const tipo of PRIORIDAD) {
    const grupo = acciones.filter((a) => a.tipo === tipo);
    if (grupo.length > 0) return azar(grupo, rng);
  }
  return azar(acciones, rng);
}
