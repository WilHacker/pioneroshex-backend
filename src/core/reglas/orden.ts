import { uniformInt } from 'pure-rand/distribution/uniformInt';
import { crearRng, mezclar } from './azar.js';

export interface TiradaDeSorteo {
  readonly jugador: string;
  readonly dados: readonly [number, number];
}

export interface Sorteo {
  /** Los jugadores de primero a último. */
  readonly orden: readonly string[];
  /**
   * Las tiradas, ronda a ronda. En la primera tiran todos; en las siguientes, solo los que habían
   * empatado (los de grupos de empate distintos tiran en la misma ronda).
   */
  readonly rondas: readonly (readonly TiradaDeSorteo[])[];
}

/** Defensa: con tantos empates seguidos algo va mal; se desempata por sorteo en vez de seguir. */
const RONDAS_MAX = 25;

const total = (t: TiradaDeSorteo): number => t.dados[0] + t.dados[1];

/** Dos dados de `jugador` en esa ronda: dependen solo de la semilla, no del orden de la lista. */
function tirar(semilla: string, ronda: number, jugador: string): readonly [number, number] {
  const rng = crearRng(`${semilla}:orden:${ronda}:${jugador}`);
  return [uniformInt(rng, 1, 6), uniformInt(rng, 1, 6)];
}

/**
 * El orden de turno «como en el Monopoly»: cada jugador tira dos dados, el más alto va primero y el
 * orden baja progresivamente. Quienes empatan vuelven a tirar entre ellos (solo ellos) hasta que se
 * decide. Es determinista: la misma semilla da siempre el mismo sorteo.
 */
export function ordenPorDados(ids: readonly string[], semilla: string): Sorteo {
  if (ids.length === 0) throw new Error('No hay jugadores que sortear');
  if (new Set(ids).size !== ids.length) throw new Error('Hay ids de jugador repetidos');
  const rondas: TiradaDeSorteo[][] = [];

  /** Ordena a `grupo` tirando en la ronda `ronda`; los empates se resuelven en la siguiente. */
  function ordenar(grupo: readonly string[], ronda: number): string[] {
    if (grupo.length <= 1) return [...grupo];
    if (ronda >= RONDAS_MAX) return mezclar(grupo, crearRng(`${semilla}:orden:desempate`));
    const tiradas = grupo.map((jugador): TiradaDeSorteo => ({
      jugador,
      dados: tirar(semilla, ronda, jugador),
    }));
    (rondas[ronda] ??= []).push(...tiradas);

    const porTotal = new Map<number, string[]>();
    for (const t of tiradas) porTotal.set(total(t), [...(porTotal.get(total(t)) ?? []), t.jugador]);
    return [...porTotal.keys()]
      .toSorted((a, b) => b - a)
      .flatMap((puntos) => ordenar(porTotal.get(puntos)!, ronda + 1));
  }

  // Ordenados antes de tirar: el resultado no depende del orden en que llegaron.
  const orden = ordenar(ids.toSorted(), 0);
  return { orden, rondas: ids.length === 1 ? [] : rondas };
}
