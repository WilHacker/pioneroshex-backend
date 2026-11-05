import { crearRng, mezclar } from '../reglas/azar.js';
import { limitesDePiezas } from '../reglas/costos.js';
import { RECURSOS, type Recurso } from '../reglas/recursos.js';
import type { Mesa } from './mesa.js';
import type { Estado, Jugador, JugadorId } from './tipos.js';

/** Cartas de cada recurso en el banco del juego clásico (hasta 4 jugadores). */
export const BANCO_POR_RECURSO_CLASICO = 19;
const JUGADORES_POR_BANCO = 4;

const porRecurso = (valor: number): Record<Recurso, number> =>
  Object.fromEntries(RECURSOS.map((r) => [r, valor])) as Record<Recurso, number>;

function validarIds(mesa: Mesa, ids: readonly JugadorId[]): void {
  if (ids.length !== mesa.config.jugadores) {
    throw new Error(`Se esperaban ${mesa.config.jugadores} jugadores y llegaron ${ids.length}`);
  }
  if (ids.some((id) => id === '')) {
    throw new Error('El id de un jugador no puede estar vacío');
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error('Hay ids de jugador repetidos');
  }
}

/** Estado inicial: orden de turno según la semilla, sin recursos y listo para la preparación. */
export function crearPartida(mesa: Mesa, ids: readonly JugadorId[]): Estado {
  validarIds(mesa, ids);
  const { config } = mesa;
  const orden = mezclar(ids, crearRng(`${config.semillaAzar}:orden`));
  const jugadores: Jugador[] = orden.map((id) => ({
    id,
    recursos: porRecurso(0),
    piezasRestantes: { ...limitesDePiezas(config.jugadores) },
  }));
  // ponytail: banco provisional 19 × ceil(jugadores/4); confirmar con el reglamento oficial.
  const banco = porRecurso(
    BANCO_POR_RECURSO_CLASICO * Math.ceil(config.jugadores / JUGADORES_POR_BANCO),
  );
  return {
    config,
    jugadores,
    fase: 'PREPARACION_POBLADO',
    turnoDe: 0,
    pasoPreparacion: 0,
    pobladoPendiente: null,
    descartesPendientes: {},
    edificios: {},
    caminos: {},
    banco,
    ladron: mesa.tablero.ladron,
    dados: null,
    tiradas: 0,
    version: 0,
    ganador: null,
  };
}
