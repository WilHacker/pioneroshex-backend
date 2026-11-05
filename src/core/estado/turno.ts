import { tirarDados } from './dados.js';
import type { Mesa } from './mesa.js';
import { repartirProduccion } from './produccion.js';
import type { Accion, Decision, Estado } from './tipos.js';

/** Tira los dados (solo en PRE_TIRADA), reparte la producción y pasa a FASE_PRINCIPAL. */
export function decidirTirada(mesa: Mesa, estado: Estado, accion: Accion): Decision {
  if (accion.tipo !== 'TIRAR_DADOS' || estado.fase !== 'PRE_TIRADA') {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }
  const dados = tirarDados(estado.config.semilla, estado.tiradas);
  const suma = dados[0] + dados[1];
  // ponytail: el 7 aquí no produce (repartirProduccion no tiene ficha 7) ni activa el ladrón;
  // el descarte y el movimiento del ladrón se completan en la Fase 2.
  return {
    ok: true,
    eventos: [
      { tipo: 'DADOS_TIRADOS', jugador: accion.jugador, dados },
      ...repartirProduccion(mesa, estado, suma),
      {
        tipo: 'FASE_CAMBIADA',
        fase: 'FASE_PRINCIPAL',
        turnoDe: estado.turnoDe,
        pasoPreparacion: estado.pasoPreparacion,
      },
    ],
  };
}

/** Termina el turno (solo en FASE_PRINCIPAL) y cede el turno al siguiente jugador. */
export function decidirFinDeTurno(_mesa: Mesa, estado: Estado, accion: Accion): Decision {
  if (accion.tipo !== 'TERMINAR_TURNO' || estado.fase !== 'FASE_PRINCIPAL') {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }
  const siguiente = (estado.turnoDe + 1) % estado.jugadores.length;
  return { ok: true, eventos: [{ tipo: 'TURNO_TERMINADO', jugador: accion.jugador, siguiente }] };
}
