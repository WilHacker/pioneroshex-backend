import type { Hex } from '../mapa/coordenadas.js';
import type { GameConfig } from '../partida/game-config.js';
import type { LimitesDePiezas } from '../reglas/costos.js';
import type { CartaDesarrollo } from '../reglas/mazo.js';
import { RECURSOS, type Recurso } from '../reglas/recursos.js';
import { desglosePuntos, puntosDe } from './puntos.js';
import type { DesglosePuntos, Estado, Fase, JugadorId } from './tipos.js';

/** Como `DesglosePuntos`, pero las cartas de punto de victoria ajenas llegan como `null`. */
export type DesglosePuntosVista = Omit<DesglosePuntos, 'cartasPuntoVictoria'> & {
  readonly cartasPuntoVictoria: number | null;
};

function desgloseVisible(desglose: DesglosePuntos, verOcultos: boolean): DesglosePuntosVista {
  if (verOcultos) return desglose;
  return {
    poblados: desglose.poblados,
    ciudades: desglose.ciudades,
    granEjercito: desglose.granEjercito,
    granRuta: desglose.granRuta,
    cartasPuntoVictoria: null,
    total: desglose.total - desglose.cartasPuntoVictoria,
  };
}

export interface VistaJugador {
  readonly id: JugadorId;
  readonly piezasRestantes: LimitesDePiezas;
  readonly totalCartas: number;
  readonly totalCartasDesarrollo: number;
  readonly caballerosJugados: number;
  readonly puntos: number;
  /** Puntos por categoría; las cartas de punto de victoria solo las ve su dueño (o todos al final). */
  readonly desglose: DesglosePuntosVista;
  /** Solo la mano del observador; `null` en las ajenas y para el espectador. */
  readonly recursos: Readonly<Record<Recurso, number>> | null;
  readonly cartasDesarrollo: readonly CartaDesarrollo[] | null;
}

export interface Vista {
  /**
   * Sin `semillaAzar`: de ella sale el azar secreto (dados, mazo). La `semillaMapa` es pública.
   * Sin `mapa`: la lista de casillas ya llega una vez en la mesa pública; no se repite en cada vista.
   */
  readonly config: Omit<GameConfig, 'semillaAzar' | 'mapa'>;
  readonly yo: JugadorId | null;
  readonly jugadores: readonly VistaJugador[];
  readonly fase: Fase;
  /** Id del jugador en turno; `null` con la partida terminada (fase FIN), ya no hay turno. */
  readonly turnoDe: JugadorId | null;
  readonly turnoEspecialDe: JugadorId | null;
  readonly tratos: Estado['tratos'];
  readonly edificios: Estado['edificios'];
  readonly caminos: Estado['caminos'];
  readonly banco: Estado['banco'];
  readonly tamanoMazo: number;
  readonly granEjercito: JugadorId | null;
  readonly granRuta: JugadorId | null;
  readonly longitudGranRuta: number;
  readonly ladron: Hex | null;
  readonly dados: Estado['dados'];
  readonly descartesPendientes: Estado['descartesPendientes'];
  readonly ganador: JugadorId | null;
  readonly version: number;
}

/**
 * Lo que puede ver `jugadorId` (o un espectador si es `null`). El servidor es autoritativo:
 * las manos ajenas nunca salen de aquí. Todo se copia; la vista no comparte referencias.
 */
export function vistaPara(estado: Estado, jugadorId: JugadorId | null): Vista {
  if (jugadorId !== null && !estado.jugadores.some((j) => j.id === jugadorId)) {
    throw new Error(`El jugador "${jugadorId}" no participa en la partida`);
  }
  const { semillaAzar: _oculta, mapa: _enLaMesa, ...configPublica } = estado.config;
  const jugadores = estado.jugadores.map((j): VistaJugador => {
    const esYo = j.id === jugadorId;
    const incluirOcultos = esYo || estado.fase === 'FIN';
    return {
      id: j.id,
      piezasRestantes: { ...j.piezasRestantes },
      totalCartas: RECURSOS.reduce((total, r) => total + j.recursos[r], 0),
      totalCartasDesarrollo: j.cartasDesarrollo.length + j.cartasCompradasEsteTurno.length,
      caballerosJugados: j.caballerosJugados,
      puntos: puntosDe(estado, j.id, { incluirOcultos }),
      desglose: desgloseVisible(desglosePuntos(estado, j.id), incluirOcultos),
      recursos: esYo ? { ...j.recursos } : null,
      cartasDesarrollo: esYo ? [...j.cartasDesarrollo, ...j.cartasCompradasEsteTurno] : null,
    };
  });
  return {
    config: configPublica,
    yo: jugadorId,
    jugadores,
    fase: estado.fase,
    turnoDe: estado.fase === 'FIN' ? null : (estado.jugadores[estado.turnoDe]?.id ?? null),
    turnoEspecialDe:
      estado.turnoEspecialDe !== null
        ? (estado.jugadores[estado.turnoEspecialDe]?.id ?? null)
        : null,
    tratos: estado.tratos.map((t) => ({
      ...t,
      entrega: { ...t.entrega },
      pide: { ...t.pide },
      rechazadoPor: [...t.rechazadoPor],
    })),
    edificios: Object.fromEntries(Object.entries(estado.edificios).map(([v, e]) => [v, { ...e }])),
    caminos: { ...estado.caminos },
    banco: { ...estado.banco },
    tamanoMazo: estado.mazo.length,
    granEjercito: estado.granEjercito,
    granRuta: estado.granRuta,
    longitudGranRuta: estado.longitudGranRuta,
    ladron: estado.ladron && { ...estado.ladron },
    dados: estado.dados && [estado.dados[0], estado.dados[1]],
    descartesPendientes: { ...estado.descartesPendientes },
    ganador: estado.ganador,
    version: estado.version,
  };
}
