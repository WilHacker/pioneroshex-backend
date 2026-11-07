import { hex } from '../mapa/coordenadas.js';
import { crearMapaDesdeCasillas, tierraConectada } from '../mapa/mapa.js';

export const JUGADORES_MIN = 2;
export const JUGADORES_MAX = 12;
/** Puntos para ganar en el juego clásico y mínimo permitido al personalizarlos. */
export const PUNTOS_VICTORIA_CLASICO = 10;
export const PUNTOS_VICTORIA_MIN = 3;

/** A: sube el límite de mano y no hay pausas. B: clásica, con construcción especial (5+ jugadores). */
export type TurnRuleMode = 'A' | 'B';

const MODOS: ReadonlySet<string> = new Set<TurnRuleMode>(['A', 'B']);

/** AZAR: cada tirada es independiente. EQUILIBRADO: en cada 36 tiradas sale cada combinación una vez. */
export type ModoDados = 'AZAR' | 'EQUILIBRADO';

const MODOS_DADOS: ReadonlySet<string> = new Set<ModoDados>(['AZAR', 'EQUILIBRADO']);

/** Hasta aquí se juega en el mapa clásico (radio 2). Más jugadores, mapa más grande. */
const JUGADORES_MAPA_CLASICO = 4;
const RADIO_CLASICO = 2;
const RADIO_GRANDE = 3;
/** Con más de 10 jugadores el radio 3 (96 vértices) queda apretado: se pasa al 4 (150). */
const JUGADORES_MAPA_GRANDE = 10;
const RADIO_MUY_GRANDE = 4;
const LIMITE_MANO_CLASICO = 7;
const LIMITE_MANO_MODO_A_GRANDE = 9;
const LIMITE_MANO_MIN = 2;
/** Cada jugador pone 2 poblados en la preparación: el mapa necesita al menos esos vértices. */
const POBLADOS_INICIALES = 2;
/** Por la regla de la distancia, un poblado deja inutilizables su vértice y sus (hasta) 3 vecinos. */
const VERTICES_BLOQUEADOS = 4;

/** Defensa en profundidad: un mapa propio enorme gastaría CPU y memoria al construirlo. */
export const MAPA_CASILLAS_MAX = 400;

/**
 * Mapa propio de la partida: la lista de casillas `[q, r]` va **copiada** dentro de la config, así
 * una partida guardada se restaura igual aunque el catálogo de mapas cambie después.
 */
export interface MapaConfig {
  readonly nombre: string;
  readonly casillas: readonly (readonly [number, number])[];
}

/** Lo que el anfitrión fija al crear la sala; gobierna las reglas de la partida. */
export interface GameConfig {
  /** Semilla pública y compartible para generar el tablero y los puertos. */
  readonly semillaMapa: string;
  /** Semilla privada del servidor para orden de turno, dados y mazo (auditable al finalizar). */
  readonly semillaAzar: string;
  readonly jugadores: number;
  /** Radio del mapa hexagonal (R=2 → 19 casillas). Con `mapa`, es el del mapa propio. */
  readonly radio: number;
  /** Mapa propio. Sin él, el tablero es el hexágono de `radio`. */
  readonly mapa?: MapaConfig;
  readonly turnRuleMode: TurnRuleMode;
  /** Con más cartas que esto en mano, al salir un 7 se descarta la mitad. */
  readonly robberHandLimit: number;
  /** Puntos de victoria necesarios para ganar la partida. */
  readonly puntosVictoria: number;
  /** Cómo salen los dados. */
  readonly modoDados: ModoDados;
}

/**
 * Configuración de entrada. Las dos semillas son obligatorias y **independientes**:
 * - `semillaMapa` es pública (se muestra en la vista y se comparte).
 * - `semillaAzar` es secreta: de ella salen los dados, el mazo y los robos. `core/` es puro y no
 *   puede generar entropía, así que quien crea la partida (el servidor, en `modules/`) debe darla
 *   desde un generador seguro (p. ej. `crypto.randomBytes(16).toString('hex')`). Nunca derivarla
 *   de la `semillaMapa`: cualquiera que vea la vista podría calcularla.
 */
export type GameConfigEntrada = {
  readonly semillaMapa: string;
  readonly semillaAzar: string;
} & Partial<Omit<GameConfig, 'semillaMapa' | 'semillaAzar'>>;

const esEnteroEnRango = (valor: number, min: number, max: number): boolean =>
  Number.isInteger(valor) && valor >= min && valor <= max;

function radioPorDefecto(jugadores: number): number {
  if (jugadores > JUGADORES_MAPA_GRANDE) return RADIO_MUY_GRANDE;
  return jugadores > JUGADORES_MAPA_CLASICO ? RADIO_GRANDE : RADIO_CLASICO;
}

const verticesDelHexagono = (radio: number): number => 6 * (radio + 1) ** 2;

const aHex = ([q, r]: readonly [number, number]) => hex(q, r);

/** Copia congelada del mapa propio; lanza si la lista no es un mapa válido. */
function copiarMapa(entrada: MapaConfig): MapaConfig {
  if (typeof entrada.nombre !== 'string' || entrada.nombre.trim() === '') {
    throw new Error('El mapa necesita un nombre');
  }
  // Antes de copiar o construir nada: la lista puede venir de fuera de `core/`.
  if (entrada.casillas.length > MAPA_CASILLAS_MAX) {
    throw new Error(`Un mapa puede tener como máximo ${MAPA_CASILLAS_MAX} casillas`);
  }
  const casillas = entrada.casillas.map(([q, r]) => Object.freeze([q, r] as const));
  return Object.freeze({ nombre: entrada.nombre.trim(), casillas: Object.freeze(casillas) });
}

/**
 * Completa la configuración con los valores del juego clásico (escalados al número de jugadores)
 * y valida el resultado. Devuelve un objeto nuevo y congelado.
 */
export function crearGameConfig(entrada: GameConfigEntrada): GameConfig {
  const jugadores = entrada.jugadores ?? JUGADORES_MAPA_CLASICO;
  const turnRuleMode = entrada.turnRuleMode ?? 'A';
  const esMapaGrande = jugadores > JUGADORES_MAPA_CLASICO;
  const mapa = entrada.mapa === undefined ? undefined : copiarMapa(entrada.mapa);
  const radioDelMapa =
    mapa === undefined ? undefined : crearMapaDesdeCasillas(mapa.casillas.map(aHex)).radio;

  const config: GameConfig = {
    semillaMapa: entrada.semillaMapa ?? '',
    semillaAzar: entrada.semillaAzar ?? '',
    jugadores,
    turnRuleMode,
    radio: radioDelMapa ?? entrada.radio ?? radioPorDefecto(jugadores),
    ...(mapa === undefined ? {} : { mapa }),
    robberHandLimit:
      entrada.robberHandLimit ??
      (esMapaGrande && turnRuleMode === 'A' ? LIMITE_MANO_MODO_A_GRANDE : LIMITE_MANO_CLASICO),
    puntosVictoria: entrada.puntosVictoria ?? PUNTOS_VICTORIA_CLASICO,
    modoDados: entrada.modoDados ?? 'AZAR',
  };

  validar(config);
  return Object.freeze(config);
}

function validar(config: GameConfig): void {
  if (config.semillaMapa.trim() === '') {
    throw new Error('La semilla del mapa no puede estar vacía');
  }
  if (config.semillaAzar.trim() === '') {
    throw new Error('La semilla del azar no puede estar vacía');
  }
  // Cubre el error típico: derivar la secreta de la pública (`${mapa}:azar`) o repetirla.
  if (config.semillaAzar.startsWith(config.semillaMapa)) {
    throw new Error(
      'La semilla del azar debe ser independiente de la del mapa: la del mapa es pública y revelaría los dados y el mazo',
    );
  }
  if (!esEnteroEnRango(config.jugadores, JUGADORES_MIN, JUGADORES_MAX)) {
    throw new Error(
      `El número de jugadores debe ser un entero entre ${JUGADORES_MIN} y ${JUGADORES_MAX}, no ${config.jugadores}`,
    );
  }
  if (!MODOS.has(config.turnRuleMode)) {
    throw new Error(`turnRuleMode debe ser 'A' o 'B', no '${String(config.turnRuleMode)}'`);
  }
  if (!MODOS_DADOS.has(config.modoDados)) {
    throw new Error(`modoDados debe ser 'AZAR' o 'EQUILIBRADO', no '${String(config.modoDados)}'`);
  }
  if (!Number.isInteger(config.radio) || config.radio < 0) {
    throw new Error(`El radio debe ser un entero de 0 en adelante, no ${config.radio}`);
  }
  // Cada poblado bloquea como mucho VERTICES_BLOQUEADOS vértices (el suyo y 3 vecinos), así que
  // con más de 4·(2n−1) vértices el último poblado de la preparación siempre tiene sitio.
  const pobladosAntesDelUltimo = config.jugadores * POBLADOS_INICIALES - 1;
  const mapaPropio =
    config.mapa === undefined ? undefined : crearMapaDesdeCasillas(config.mapa.casillas.map(aHex));
  // Un camino no cruza el agua: con la tierra partida, cada trozo sería una isla sin salida.
  if (mapaPropio !== undefined && !tierraConectada(mapaPropio)) {
    throw new Error(`La tierra del mapa «${config.mapa?.nombre}» no está conectada`);
  }
  const vertices = mapaPropio?.vertices.length ?? verticesDelHexagono(config.radio);
  if (vertices <= VERTICES_BLOQUEADOS * pobladosAntesDelUltimo) {
    const cual =
      config.mapa === undefined ? `El radio ${config.radio}` : `El mapa «${config.mapa.nombre}»`;
    throw new Error(`${cual} es muy pequeño para ${config.jugadores} jugadores (faltan vértices)`);
  }
  if (!Number.isInteger(config.robberHandLimit) || config.robberHandLimit < LIMITE_MANO_MIN) {
    throw new Error(
      `robberHandLimit debe ser un entero de ${LIMITE_MANO_MIN} en adelante, no ${config.robberHandLimit}`,
    );
  }
  if (!Number.isInteger(config.puntosVictoria) || config.puntosVictoria < PUNTOS_VICTORIA_MIN) {
    throw new Error(
      `puntosVictoria debe ser un entero de ${PUNTOS_VICTORIA_MIN} en adelante, no ${config.puntosVictoria}`,
    );
  }
}
