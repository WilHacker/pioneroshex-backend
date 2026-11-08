import { decidirCambioConBanca } from './comercio.js';
import {
  decidirAceptarTrato,
  decidirCancelarTrato,
  decidirContraofertarTrato,
  decidirProponerTrato,
  decidirRechazarTrato,
} from './comercio-jugadores.js';
import { decidirAbandono } from './abandono.js';
import { decidirConstruccion } from './construccion.js';
import {
  decidirComprarCarta,
  decidirJugarAbundancia,
  decidirJugarCaballero,
  decidirJugarConstruccionCarreteras,
  decidirJugarMonopolio,
} from './desarrollo.js';
import { decidirDescarte } from './descarte.js';
import { decidirLadrón, decidirSaltoInactividad } from './ladron.js';
import type { Mesa } from './mesa.js';
import { decidirPreparacion } from './preparacion.js';
import { decidirFinDeTurno, decidirPasarConstruccionEspecial, decidirTirada } from './turno.js';
import type { Accion, Decision, Estado } from './tipos.js';

type Manejador = (mesa: Mesa, estado: Estado, accion: Accion) => Decision;

// El `Record` sobre `Accion['tipo']` hace que el compilador avise si falta un tipo de acción.
export const manejadores: Readonly<Record<Accion['tipo'], Manejador>> = {
  COLOCAR_POBLADO_INICIAL: decidirPreparacion,
  COLOCAR_CAMINO_INICIAL: decidirPreparacion,
  TIRAR_DADOS: decidirTirada,
  DESCARTAR_RECURSOS: decidirDescarte,
  DESCARTE_AUTOMATICO: decidirDescarte,
  MOVER_LADRON: decidirLadrón,
  SALTAR_TURNO_POR_INACTIVIDAD: decidirSaltoInactividad,
  CONSTRUIR_CAMINO: decidirConstruccion,
  CONSTRUIR_POBLADO: decidirConstruccion,
  CONSTRUIR_CIUDAD: decidirConstruccion,
  CAMBIAR_CON_BANCA: decidirCambioConBanca,
  PROPONER_TRATO: (_mesa, estado, accion) => decidirProponerTrato(estado, accion),
  ACEPTAR_TRATO: (_mesa, estado, accion) => decidirAceptarTrato(estado, accion),
  RECHAZAR_TRATO: (_mesa, estado, accion) => decidirRechazarTrato(estado, accion),
  CANCELAR_TRATO: (_mesa, estado, accion) => decidirCancelarTrato(estado, accion),
  CONTRAOFERTAR_TRATO: (_mesa, estado, accion) => decidirContraofertarTrato(estado, accion),
  COMPRAR_CARTA_DESARROLLO: decidirComprarCarta,
  JUGAR_CABALLERO: decidirJugarCaballero,
  JUGAR_CONSTRUCCION_CARRETERAS: decidirJugarConstruccionCarreteras,
  JUGAR_ABUNDANCIA: decidirJugarAbundancia,
  JUGAR_MONOPOLIO: decidirJugarMonopolio,
  PASAR_CONSTRUCCION_ESPECIAL: decidirPasarConstruccionEspecial,
  TERMINAR_TURNO: decidirFinDeTurno,
  ABANDONAR: (_mesa, estado, accion) => decidirAbandono(estado, accion),
};

/** Valida una acción y devuelve los eventos que produce o el motivo del rechazo. No muta nada. */
export function decidir(mesa: Mesa, estado: Estado, accion: Accion): Decision {
  if (estado.fase === 'FIN') return { ok: false, motivo: 'PARTIDA_TERMINADA' };
  const indice = estado.jugadores.findIndex((j) => j.id === accion.jugador);
  if (indice === -1) return { ok: false, motivo: 'JUGADOR_DESCONOCIDO' };

  // Abandonar no depende del turno ni de la fase: se puede en cualquier momento.
  if (accion.tipo === 'ABANDONAR') return decidirAbandono(estado, accion);

  if (estado.fase === 'DESCARTE') {
    // En descarte, cualquier jugador con descartes pendientes puede actuar
  } else if (estado.fase === 'CONSTRUCCION_ESPECIAL') {
    if (indice !== estado.turnoEspecialDe) {
      return { ok: false, motivo: 'NO_ES_TU_TURNO' };
    }
  } else if (
    estado.fase === 'FASE_PRINCIPAL' &&
    (accion.tipo === 'ACEPTAR_TRATO' ||
      accion.tipo === 'RECHAZAR_TRATO' ||
      accion.tipo === 'CONTRAOFERTAR_TRATO') &&
    estado.tratos.length > 0
  ) {
    // Los rivales pueden responder a tratos existentes durante FASE_PRINCIPAL
  } else if (indice !== estado.turnoDe) {
    return { ok: false, motivo: 'NO_ES_TU_TURNO' };
  }

  // Va tras los chequeos generales: un tipo desconocido es una acción que no toca en ninguna fase.
  // `Object.hasOwn` evita llamar a lo heredado del prototipo ('constructor', 'toString'...).
  if (!Object.hasOwn(manejadores, accion.tipo)) return { ok: false, motivo: 'FASE_INCORRECTA' };
  return manejadores[accion.tipo](mesa, estado, accion);
}
