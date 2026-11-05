export const JUGADORES_MIN = 2;
export const JUGADORES_MAX = 10;

/** A: sube el límite de mano y no hay pausas. B: clásica, con construcción especial (5+ jugadores). */
export type TurnRuleMode = 'A' | 'B';

const MODOS: ReadonlySet<string> = new Set<TurnRuleMode>(['A', 'B']);

/** Hasta aquí se juega en el mapa clásico (radio 2). Más jugadores, mapa más grande. */
const JUGADORES_MAPA_CLASICO = 4;
const RADIO_CLASICO = 2;
const RADIO_GRANDE = 3;
const LIMITE_MANO_CLASICO = 7;
const LIMITE_MANO_MODO_A_GRANDE = 9;
const LIMITE_MANO_MIN = 2;
/** Cada jugador pone 2 poblados en la preparación: el mapa necesita al menos esos vértices. */
const POBLADOS_INICIALES = 2;

/** Lo que el anfitrión fija al crear la sala; gobierna las reglas de la partida. */
export interface GameConfig {
  readonly semilla: string;
  readonly jugadores: number;
  /** Radio del mapa hexagonal (R=2 → 19 casillas). */
  readonly radio: number;
  readonly turnRuleMode: TurnRuleMode;
  /** Con más cartas que esto en mano, al salir un 7 se descarta la mitad. */
  readonly robberHandLimit: number;
}

/** Solo la semilla es obligatoria: `core/` no puede inventar azar (nada de `Math.random`). */
export type GameConfigEntrada = Pick<GameConfig, 'semilla'> & Partial<Omit<GameConfig, 'semilla'>>;

const esEnteroEnRango = (valor: number, min: number, max: number): boolean =>
  Number.isInteger(valor) && valor >= min && valor <= max;

const verticesDelMapa = (radio: number): number => 6 * (radio + 1) ** 2;

/**
 * Completa la configuración con los valores del juego clásico (escalados al número de jugadores)
 * y valida el resultado. Devuelve un objeto nuevo y congelado.
 */
export function crearGameConfig(entrada: GameConfigEntrada): GameConfig {
  const jugadores = entrada.jugadores ?? JUGADORES_MAPA_CLASICO;
  const turnRuleMode = entrada.turnRuleMode ?? 'A';
  const esMapaGrande = jugadores > JUGADORES_MAPA_CLASICO;

  const config: GameConfig = {
    semilla: entrada.semilla,
    jugadores,
    turnRuleMode,
    radio: entrada.radio ?? (esMapaGrande ? RADIO_GRANDE : RADIO_CLASICO),
    robberHandLimit:
      entrada.robberHandLimit ??
      (esMapaGrande && turnRuleMode === 'A' ? LIMITE_MANO_MODO_A_GRANDE : LIMITE_MANO_CLASICO),
  };

  validar(config);
  return Object.freeze(config);
}

function validar(config: GameConfig): void {
  if (config.semilla.trim() === '') {
    throw new Error('La semilla no puede estar vacía');
  }
  if (!esEnteroEnRango(config.jugadores, JUGADORES_MIN, JUGADORES_MAX)) {
    throw new Error(
      `El número de jugadores debe ser un entero entre ${JUGADORES_MIN} y ${JUGADORES_MAX}, no ${config.jugadores}`,
    );
  }
  if (!MODOS.has(config.turnRuleMode)) {
    throw new Error(`turnRuleMode debe ser 'A' o 'B', no '${String(config.turnRuleMode)}'`);
  }
  if (!Number.isInteger(config.radio) || config.radio < 0) {
    throw new Error(`El radio debe ser un entero de 0 en adelante, no ${config.radio}`);
  }
  // ponytail: condición necesaria, no suficiente (ignora la regla de la distancia). Si hace falta
  // garantizar que la preparación siempre se puede completar, calcularlo con el grafo del mapa.
  if (verticesDelMapa(config.radio) < config.jugadores * POBLADOS_INICIALES) {
    throw new Error(
      `El radio ${config.radio} es muy pequeño para ${config.jugadores} jugadores (faltan vértices)`,
    );
  }
  if (!Number.isInteger(config.robberHandLimit) || config.robberHandLimit < LIMITE_MANO_MIN) {
    throw new Error(
      `robberHandLimit debe ser un entero de ${LIMITE_MANO_MIN} en adelante, no ${config.robberHandLimit}`,
    );
  }
}
