import { DIRECCIONES, type Hex, casillasPorRadio, clave, hex, sumar } from '../mapa/coordenadas.js';
import { crearMapaDesdeCasillas, costasDelMapa, tierraConectada } from '../mapa/mapa.js';
import type { MapaConfig } from '../partida/game-config.js';
import { generarPuertos } from '../reglas/puertos.js';
import { generarTablero } from '../reglas/tablero.js';
import { anillo, aPares, desdeDibujo, type Par, rombo, sinCasillas } from './formas.js';
import { JUGADORES_MIN } from '../partida/game-config.js';
import {
  maximoPorVertices,
  maximoRecomendado,
  maximoTecnico,
  minimoRecomendado,
} from './jugadores.js';

/**
 * Un mapa del catálogo: solo la forma (dónde hay tierra). Los terrenos y las fichas salen de la
 * `semillaMapa` de la partida, así que el mismo mapa da tableros distintos con semillas distintas.
 * Las formas son dibujos propios; de otros juegos solo se tomó la idea del nombre.
 */
export interface MapaDelCatalogo {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly casillas: readonly Par[];
}

const escala = (h: Hex, k: number): Hex => hex(h.q * k, h.r * k);
const desplazar = (casillas: readonly Hex[], dq: number, dr: number): readonly Hex[] =>
  casillas.map((c) => hex(c.q + dq, c.r + dr));

/** Quita las repetidas, conservando el orden. */
function sinRepetidas(casillas: readonly Hex[]): readonly Hex[] {
  const vistas = new Set<string>();
  return casillas.filter((c) => !vistas.has(clave(c)) && vistas.add(clave(c)));
}

/** Tres brazos curvados alrededor de un centro, como un molinete. */
function molinete(): readonly Hex[] {
  const casillas: Hex[] = [...casillasPorRadio(1)];
  for (const i of [0, 2, 4]) {
    const brazo = DIRECCIONES[i]!;
    const lado = DIRECCIONES[(i + 1) % 6]!;
    for (let t = 1; t <= 4; t++) casillas.push(escala(brazo, t), sumar(escala(brazo, t), lado));
    casillas.push(sumar(escala(brazo, 4), escala(lado, 2))); // el gancho de la punta
  }
  return sinRepetidas(casillas);
}

/** Dos masas de tierra frente a frente, unidas solo por un paso de una casilla. */
const dosBandos = (): readonly Hex[] => [
  ...desplazar(casillasPorRadio(2), -3, 0),
  hex(0, 0),
  ...desplazar(casillasPorRadio(2), 3, 0),
];

const BOSQUE_NEGRO = [
  '. . # # # . . .',
  ' . # # # # # . .',
  '. # # # # # # .',
  ' # # # # # # # .',
  '. # # # # # # .',
  ' . . # # # # # .',
  '. . . # # # . .',
  ' . . . . # . . .',
];

// Los países con masas separadas van unidas por un puente de tierra de una casilla: un camino no
// cruza el agua. Es una licencia deliberada frente a la forma real.
const EEUU = [
  '. . # # # # # # # # # # . . .',
  ' . # # # # # # # # # # # # . .',
  '. # # # # # # # # # # # # # .',
  ' . . # # # # # # # # # # # . .',
  '. . . # # # # # # # # # . . .',
  ' . . . . # # # . . . . # # . .',
  '. . . . . # . . . . . . # . .',
  ' . . . . . . . . . . . . # . .',
];

const REINO_UNIDO = [
  '. . . . . . # # . .',
  ' . . . . . # # # . .',
  '. . . . . # # # . . .',
  ' . . # # # # # # . . .',
  '. . # # # . # # # . .',
  ' . . . # # . . # # # .',
  '. . . . . . . # # # .',
  ' . . . . . . . # # . .',
];

const TIERRA = [
  '. . . # # # # # # # # # # # # # # . . .',
  ' . . # # # # . . . . # # # # # # # # # .',
  '. . # # # # # . . # # # # # # # # # # .',
  ' . . . # # # # . . # # # # # # # # # . .',
  '. . . . # # . . # # # # . # # # # . . .',
  ' . . . . . # . . . # # # # . . # # . . .',
  '. . . . . # # . . # # # # . . . . # # .',
  ' . . . . . # # # . . # # # . . . . # # .',
  '. . . . . . # # . . . # # . . . . . . .',
  ' . . . . . . # . . . . . # . . . . . . .',
];

const mapa = (
  id: string,
  nombre: string,
  descripcion: string,
  casillas: readonly Hex[],
): MapaDelCatalogo =>
  Object.freeze({ id, nombre, descripcion, casillas: Object.freeze(aPares(casillas)) });

export const CATALOGO: readonly MapaDelCatalogo[] = Object.freeze([
  mapa('clasico', 'Clásico', 'El hexágono de 19 casillas de siempre.', casillasPorRadio(2)),
  mapa('grande', 'Grande', 'Hexágono de 37 casillas, para partidas de 4 a 8.', casillasPorRadio(3)),
  mapa(
    'gigante',
    'Gigante',
    'Hexágono de 61 casillas, para las mesas más llenas.',
    casillasPorRadio(4),
  ),
  mapa('diamante', 'Diamante', 'Un rombo de 6 × 6 casillas.', rombo(6)),
  mapa(
    'engranaje',
    'Engranaje',
    'Un hexágono con dientes en la orilla y un agujero en el centro.',
    sinCasillas(casillasPorRadio(4), [hex(0, 0), ...anillo(4).filter((_, i) => i % 2 === 1)]),
  ),
  mapa(
    'lagos',
    'Lagos',
    'Tres lagos pequeños repartidos por el interior.',
    sinCasillas(casillasPorRadio(4), [hex(2, -1), hex(-1, 2), hex(-1, -1)]),
  ),
  mapa(
    'estanque',
    'Estanque',
    'Un gran estanque en el centro y tierra alrededor.',
    sinCasillas(casillasPorRadio(3), casillasPorRadio(1)),
  ),
  mapa('remolino', 'Remolino', 'Tres brazos que giran alrededor del centro.', molinete()),
  mapa('lucha', 'Lucha', 'Dos bandos frente a frente y un solo paso entre ellos.', dosBandos()),
  mapa('bosque-negro', 'Bosque Negro', 'Una isla de costas recortadas.', desdeDibujo(BOSQUE_NEGRO)),
  mapa(
    'volcan',
    'Volcán',
    'Un cráter en el centro abierto al mar por una grieta.',
    sinCasillas(casillasPorRadio(4), [...casillasPorRadio(1), hex(2, 0), hex(3, 0), hex(4, 0)]),
  ),
  mapa(
    'fiebre-del-oro',
    'Fiebre del Oro',
    'Un cañón que parte el mapa en dos, con un puente de dos casillas en el centro.',
    sinCasillas(casillasPorRadio(3), [hex(0, -3), hex(0, -2), hex(0, 1), hex(0, 2), hex(0, 3)]),
  ),
  mapa('eeuu', 'EE. UU.', 'Una silueta de Estados Unidos con Florida y Texas.', desdeDibujo(EEUU)),
  mapa(
    'reino-unido',
    'Reino Unido e Irlanda',
    'Gran Bretaña e Irlanda unidas por un puente sobre el mar de Irlanda.',
    desdeDibujo(REINO_UNIDO),
  ),
  mapa(
    'tierra',
    'Tierra',
    'Los continentes unidos por puentes en el Ártico, Panamá y Suez.',
    desdeDibujo(TIERRA),
  ),
]);

const PORID = new Map(CATALOGO.map((m) => [m.id, m]));

/** Busca un mapa por su id; `undefined` si no existe. */
export const mapaDelCatalogo = (id: string): MapaDelCatalogo | undefined => PORID.get(id);

/** La forma que guarda `GameConfig.mapa`. */
export const aMapaConfig = (m: MapaDelCatalogo): MapaConfig => ({
  nombre: m.nombre,
  casillas: m.casillas,
});

const aHex = ([q, r]: Par): Hex => hex(q, r);

export interface InfoDeMapa {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly casillas: number;
  readonly vertices: number;
  readonly maximoTecnico: number;
  readonly maximoRecomendado: number;
  readonly minimoRecomendado: number;
}

/** Los mapas del catálogo no cambian: la info se calcula una sola vez por mapa. */
const INFO_CALCULADA = new WeakMap<MapaDelCatalogo, InfoDeMapa>();

/** Tamaño del mapa y su rango de jugadores (lo que muestra el selector de la sala). */
export function infoDelMapa(m: MapaDelCatalogo): InfoDeMapa {
  const calculada = INFO_CALCULADA.get(m);
  if (calculada) return calculada;
  const { vertices } = crearMapaDesdeCasillas(m.casillas.map(aHex));
  const info: InfoDeMapa = Object.freeze({
    id: m.id,
    nombre: m.nombre,
    descripcion: m.descripcion,
    casillas: m.casillas.length,
    vertices: vertices.length,
    maximoTecnico: maximoTecnico(vertices.length),
    maximoRecomendado: maximoRecomendado(vertices.length),
    minimoRecomendado: minimoRecomendado(vertices.length),
  });
  INFO_CALCULADA.set(m, info);
  return info;
}

/** La info del mapa más su forma (`[q, r]` por casilla), para dibujar la vista previa. */
export interface InfoDeMapaConForma extends InfoDeMapa {
  readonly forma: readonly Par[];
}

let LISTA_DEL_CATALOGO: readonly InfoDeMapaConForma[] | undefined;

/** Todo el catálogo listo para mandar al cliente; se arma la primera vez y se reutiliza. */
export function infoDelCatalogo(): readonly InfoDeMapaConForma[] {
  LISTA_DEL_CATALOGO ??= Object.freeze(
    CATALOGO.map((m) => Object.freeze({ ...infoDelMapa(m), forma: m.casillas })),
  );
  return LISTA_DEL_CATALOGO;
}

const SEMILLAS_DE_COMPROBACION = ['uno', 'dos', 'tres'];

/**
 * Lo que impide jugar un mapa: tierra partida, casillas repetidas, un tablero que no se puede
 * repartir, una costa sin puertos o un tamaño en el que no cabe ni una partida mínima.
 * Una lista vacía significa que el mapa sirve.
 */
export function problemasDelMapa(m: MapaDelCatalogo): readonly string[] {
  try {
    const dibujado = crearMapaDesdeCasillas(m.casillas.map(aHex));
    const problemas: string[] = [];
    if (!tierraConectada(dibujado)) {
      return ['La tierra del mapa no está conectada'];
    }
    for (const semilla of SEMILLAS_DE_COMPROBACION) {
      generarTablero(dibujado, semilla);
      if (generarPuertos(dibujado, semilla).length === 0) {
        problemas.push('La costa exterior no alcanza para ningún puerto');
        break;
      }
    }
    if (costasDelMapa(dibujado).exterior.length === 0) problemas.push('El mapa no tiene costa');
    // Sin forzar al mínimo: `maximoTecnico` sube hasta 2 aunque no quepan los poblados iniciales.
    if (maximoPorVertices(dibujado.vertices.length) < JUGADORES_MIN) {
      problemas.push(`El mapa es demasiado pequeño: no caben ${JUGADORES_MIN} jugadores`);
    }
    return problemas;
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}
