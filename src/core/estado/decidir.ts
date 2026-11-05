import { decidirConstruccion } from './construccion.js';
import type { Mesa } from './mesa.js';
import { decidirPreparacion } from './preparacion.js';
import { decidirFinDeTurno, decidirTirada } from './turno.js';
import type { Accion, Decision, Estado } from './tipos.js';

type Manejador = (mesa: Mesa, estado: Estado, accion: Accion) => Decision;

// El `Record` sobre `Accion['tipo']` hace que el compilador avise si falta un tipo de acción.
export const manejadores: Readonly<Record<Accion['tipo'], Manejador>> = {
  COLOCAR_POBLADO_INICIAL: decidirPreparacion,
  COLOCAR_CAMINO_INICIAL: decidirPreparacion,
  TIRAR_DADOS: decidirTirada,
  CONSTRUIR_CAMINO: decidirConstruccion,
  CONSTRUIR_POBLADO: decidirConstruccion,
  CONSTRUIR_CIUDAD: decidirConstruccion,
  TERMINAR_TURNO: decidirFinDeTurno,
};

/** Valida una acción y devuelve los eventos que produce o el motivo del rechazo. No muta nada. */
export function decidir(mesa: Mesa, estado: Estado, accion: Accion): Decision {
  if (estado.fase === 'FIN') return { ok: false, motivo: 'PARTIDA_TERMINADA' };
  const indice = estado.jugadores.findIndex((j) => j.id === accion.jugador);
  if (indice === -1) return { ok: false, motivo: 'JUGADOR_DESCONOCIDO' };
  if (indice !== estado.turnoDe) return { ok: false, motivo: 'NO_ES_TU_TURNO' };
  // Va tras los chequeos generales: un tipo desconocido es una acción que no toca en ninguna fase.
  // `Object.hasOwn` evita llamar a lo heredado del prototipo ('constructor', 'toString'...).
  if (!Object.hasOwn(manejadores, accion.tipo)) return { ok: false, motivo: 'FASE_INCORRECTA' };
  return manejadores[accion.tipo](mesa, estado, accion);
}
