import { enumerarAcciones } from '../estado/acciones.js';
import { aplicar } from '../estado/aplicar.js';
import { crearPartida } from '../estado/crear.js';
import { crearMesa, type Mesa } from '../estado/mesa.js';
import type { Accion, Estado, JugadorId } from '../estado/tipos.js';
import type { GameConfig } from '../partida/game-config.js';
import { crearRng } from '../reglas/azar.js';
import { elegirAccion } from './bot.js';
import { verificarInvariantes } from './invariantes.js';

export interface OpcionesSimulacion {
  readonly semillaBot: string;
  /** Turnos (tiradas de dados) máximos antes de declarar estancamiento. */
  readonly maxTurnos: number;
  /** Acciones máximas dentro de un mismo turno (la preparación cuenta como turno 0). */
  readonly maxAccionesPorTurno?: number;
}

/** Generoso: un turno real no pasa de unas decenas de acciones (piezas y recursos son finitos). */
const MAX_ACCIONES_POR_TURNO = 500;

export interface Simulacion {
  readonly estado: Estado;
  readonly acciones: readonly Accion[];
  readonly turnos: number;
}

function aplicarOLanzar(mesa: Mesa, estado: Estado, accion: Accion): Estado {
  const resultado = aplicar(mesa, estado, accion);
  if (!resultado.ok) {
    throw new Error(`Acción rechazada (${resultado.motivo}): ${JSON.stringify(accion)}`);
  }
  return resultado.estado;
}

function comprobar(mesa: Mesa, estado: Estado, paso: number): void {
  const violaciones = verificarInvariantes(mesa, estado);
  if (violaciones.length > 0) {
    throw new Error(`Invariantes violadas tras la acción ${paso}: ${violaciones.join(', ')}`);
  }
}

function comprobarTopes(estado: Estado, enEsteTurno: number, opciones: OpcionesSimulacion): void {
  if (estado.tiradas > opciones.maxTurnos) {
    throw new Error(`estancamiento: sin ganador tras ${opciones.maxTurnos} turnos`);
  }
  const maxAcciones = opciones.maxAccionesPorTurno ?? MAX_ACCIONES_POR_TURNO;
  if (enEsteTurno >= maxAcciones) {
    throw new Error(`estancamiento: más de ${maxAcciones} acciones en el turno ${estado.tiradas}`);
  }
}

/**
 * Juega una partida completa con bots: en cada paso enumera las acciones legales del jugador en
 * turno, elige una, la aplica y verifica las invariantes. Lanza si alguna falla, y lanza
 * `estancamiento` si se pasa de `maxTurnos` (tiradas) o de `maxAccionesPorTurno`.
 */
export function simularPartida(
  config: GameConfig,
  ids: readonly JugadorId[],
  opciones: OpcionesSimulacion,
): Simulacion {
  const mesa = crearMesa(config);
  const rng = crearRng(`${opciones.semillaBot}:bot`);
  const acciones: Accion[] = [];
  let estado = crearPartida(mesa, ids);
  let enEsteTurno = 0;
  comprobar(mesa, estado, 0);
  while (estado.fase !== 'FIN') {
    comprobarTopes(estado, enEsteTurno, opciones);
    const tiradasAntes = estado.tiradas;
    const jugador = estado.jugadores[estado.turnoDe]!.id;
    const accion = elegirAccion(enumerarAcciones(mesa, estado, jugador), rng);
    estado = aplicarOLanzar(mesa, estado, accion);
    acciones.push(accion);
    enEsteTurno = estado.tiradas === tiradasAntes ? enEsteTurno + 1 : 0;
    comprobar(mesa, estado, acciones.length);
  }
  return { estado, acciones, turnos: estado.tiradas };
}

/** Rehace una partida desde cero aplicando `acciones` en orden; lanza si alguna se rechaza. */
export function reproducir(
  config: GameConfig,
  ids: readonly JugadorId[],
  acciones: readonly Accion[],
): Estado {
  const mesa = crearMesa(config);
  return acciones.reduce(
    (estado, accion) => aplicarOLanzar(mesa, estado, accion),
    crearPartida(mesa, ids),
  );
}
