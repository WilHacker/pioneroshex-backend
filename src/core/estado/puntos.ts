import type { Estado, JugadorId, TipoEdificio } from './tipos.js';

const PUNTOS_POR_EDIFICIO: Readonly<Record<TipoEdificio, number>> = { POBLADO: 1, CIUDAD: 2 };

/** Puntos públicos visibles de un jugador (edificios + gran ejército + gran ruta). */
export function puntosPublicosDe(estado: Estado, jugador: JugadorId): number {
  const puntosEdificios = Object.values(estado.edificios)
    .filter((e) => e.dueno === jugador)
    .reduce((total, e) => total + PUNTOS_POR_EDIFICIO[e.tipo], 0);
  const puntosEjercito = estado.granEjercito === jugador ? 2 : 0;
  const puntosRuta = estado.granRuta === jugador ? 2 : 0;
  return puntosEdificios + puntosEjercito + puntosRuta;
}

/** Puntos provenientes de cartas de desarrollo de tipo PUNTO_VICTORIA. */
export function puntosOcultosDe(estado: Estado, jugador: JugadorId): number {
  const j = estado.jugadores.find((jug) => jug.id === jugador);
  if (!j) return 0;
  const pvDesarrollo = j.cartasDesarrollo.filter((c) => c === 'PUNTO_VICTORIA').length;
  const pvCompradas = j.cartasCompradasEsteTurno.filter((c) => c === 'PUNTO_VICTORIA').length;
  return pvDesarrollo + pvCompradas;
}

/** Puntos de victoria de un jugador (por defecto incluye solo públicos; opcionalmente ocultos). */
export function puntosDe(
  estado: Estado,
  jugador: JugadorId,
  opciones: { incluirOcultos?: boolean } = {},
): number {
  const base = puntosPublicosDe(estado, jugador);
  return opciones.incluirOcultos ? base + puntosOcultosDe(estado, jugador) : base;
}
