import { hex } from '../mapa/coordenadas.js';
import { crearMapaDesdeCasillas, tierraConectada } from '../mapa/mapa.js';

export const JUGADORES_MIN = 2;
export const JUGADORES_MAX = 12;
/** Puntos para ganar en el juego clásico y mínimo permitido al personalizarlos. */
export const PUNTOS_VICTORIA_CLASICO = 10;
export const PUNTOS_VICTORIA_MIN = 3;
/** Con «ladrón amistoso», solo se roba a quien tiene al menos estos puntos (públicos). */
export const PUNTOS_LADRON_AMISTOSO = 3;

/** A: sube el límite de mano y no hay pausas. B: clásica, con construcción especial (5+ jugadores). */
export type TurnRuleMode = 'A' | 'B';

const MODOS: ReadonlySet<string> = new Set<TurnRuleMode>(['A', 'B']);

/** AZAR, EQUILIBRADO (36 tiradas, cada combinación una vez), BARAJA (se rebaraja antes de agotarse), SIN_RACHAS. */
export type ModoDados = 'AZAR' | 'EQUILIBRADO' | 'BARAJA' | 'SIN_RACHAS';

const MODOS_DADOS: ReadonlySet<string> = new Set<ModoDados>([
  'AZAR',
  'EQUILIBRADO',
  'BARAJA',
  'SIN_RACHAS',
]);

/** Con «arranque protegido», no sale ningún 7 durante estas rondas (una tirada por jugador cada una). */
export const RONDAS_ARRANQUE_PROTEGIDO = 2;

/**
 * Quién empieza y en qué orden se juega.
 * ALEATORIO: se baraja con la semilla. TIRADA: como el Monopoly, cada uno tira dos dados y el más
 * alto va primero (los empates repiten entre ellos). ENTRADA: por orden de llegada a la sala.
 */
export type OrdenDeTurno = 'ALEATORIO' | 'TIRADA' | 'ENTRADA';

/**
 * Cómo se comercia entre jugadores. LIBRE: ofertas abiertas o dirigidas, visibles para todos.
 * PRIVADO: toda oferta va dirigida a alguien y solo la ven los dos implicados.
 * SOLO_BANCO: no hay tratos entre jugadores; solo se cambia con el banco.
 */
export type ModoComercio = 'LIBRE' | 'PRIVADO' | 'SOLO_BANCO';

const MODOS_COMERCIO: ReadonlySet<string> = new Set<ModoComercio>([
  'LIBRE',
  'PRIVADO',
  'SOLO_BANCO',
]);

/** Tope máximo que se puede fijar de ofertas por turno (0 es sin tope). */
export const OFERTAS_POR_TURNO_MAX = 20;

const ORDENES: ReadonlySet<string> = new Set<OrdenDeTurno>(['ALEATORIO', 'TIRADA', 'ENTRADA']);

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
  /** Cómo se decide quién juega primero y el orden de los turnos. */
  readonly ordenDeTurno: OrdenDeTurno;
  /** Ladrón amistoso: no se puede robar a quien tiene menos de `PUNTOS_LADRON_AMISTOSO` puntos. */
  readonly ladronAmistoso: boolean;
  /** Cómo se comercia entre jugadores. */
  readonly modoComercio: ModoComercio;
  /** Sin 7 en las primeras `RONDAS_ARRANQUE_PROTEGIDO` rondas. */
  readonly arranqueProtegido: boolean;
  /** No se enseña cuántas cartas quedan en el banco ni en el mazo de desarrollo. */
  readonly ocultarBanco: boolean;
  /** Las cartas de recursos de todos son visibles (las de desarrollo siguen secretas). */
  readonly manosVisibles: boolean;
  /** Ofertas que puede hacer por turno quien tiene el turno; 0 es sin tope. */
  readonly maxOfertasPorTurno: number;
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
    ordenDeTurno: entrada.ordenDeTurno ?? 'ALEATORIO',
    ladronAmistoso: entrada.ladronAmistoso ?? false,
    modoComercio: entrada.modoComercio ?? 'LIBRE',
    arranqueProtegido: entrada.arranqueProtegido ?? false,
    ocultarBanco: entrada.ocultarBanco ?? false,
    manosVisibles: entrada.manosVisibles ?? false,
    maxOfertasPorTurno: entrada.maxOfertasPorTurno ?? 0,
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
    throw new Error(
      `modoDados debe ser 'AZAR', 'EQUILIBRADO', 'BARAJA' o 'SIN_RACHAS', no '${String(config.modoDados)}'`,
    );
  }
  if (typeof config.ladronAmistoso !== 'boolean') {
    throw new Error(
      `ladronAmistoso debe ser verdadero o falso, no '${String(config.ladronAmistoso)}'`,
    );
  }
  for (const campo of ['ocultarBanco', 'manosVisibles'] as const) {
    if (typeof config[campo] !== 'boolean') {
      throw new Error(`${campo} debe ser verdadero o falso, no '${String(config[campo])}'`);
    }
  }
  if (typeof config.arranqueProtegido !== 'boolean') {
    throw new Error(
      `arranqueProtegido debe ser verdadero o falso, no '${String(config.arranqueProtegido)}'`,
    );
  }
  if (!MODOS_COMERCIO.has(config.modoComercio)) {
    throw new Error(
      `modoComercio debe ser 'LIBRE', 'PRIVADO' o 'SOLO_BANCO', no '${String(config.modoComercio)}'`,
    );
  }
  if (
    !Number.isInteger(config.maxOfertasPorTurno) ||
    config.maxOfertasPorTurno < 0 ||
    config.maxOfertasPorTurno > OFERTAS_POR_TURNO_MAX
  ) {
    throw new Error(
      `maxOfertasPorTurno debe ser un entero de 0 a ${OFERTAS_POR_TURNO_MAX}, no ${config.maxOfertasPorTurno}`,
    );
  }
  if (!ORDENES.has(config.ordenDeTurno)) {
    throw new Error(
      `ordenDeTurno debe ser 'ALEATORIO', 'TIRADA' o 'ENTRADA', no '${String(config.ordenDeTurno)}'`,
    );
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
