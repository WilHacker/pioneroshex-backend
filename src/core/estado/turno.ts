import { RECURSOS } from '../reglas/recursos.js';
import { tirarDados } from './dados.js';
import type { Mesa } from './mesa.js';
import { repartirProduccion } from './produccion.js';
import type { Accion, Decision, Estado, Evento } from './tipos.js';

/** Tira los dados (solo en PRE_TIRADA), reparte producción o inicia robo con 7. */
export function decidirTirada(mesa: Mesa, estado: Estado, accion: Accion): Decision {
  if (accion.tipo !== 'TIRAR_DADOS' || estado.fase !== 'PRE_TIRADA') {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }
  const dados = tirarDados(estado.config.semillaAzar, estado.tiradas);
  const suma = dados[0] + dados[1];

  if (suma === 7) {
    const eventosDescarte: Evento[] = [];
    for (const jugador of estado.jugadores) {
      const totalCartas = RECURSOS.reduce((s, r) => s + jugador.recursos[r], 0);
      if (totalCartas > estado.config.robberHandLimit) {
        eventosDescarte.push({
          tipo: 'DESCARTE_REQUERIDO',
          jugador: jugador.id,
          cantidad: Math.floor(totalCartas / 2),
        });
      }
    }
    const siguienteFase = eventosDescarte.length > 0 ? 'DESCARTE' : 'MOVER_LADRON';
    return {
      ok: true,
      eventos: [
        { tipo: 'DADOS_TIRADOS', jugador: accion.jugador, dados },
        ...eventosDescarte,
        {
          tipo: 'FASE_CAMBIADA',
          fase: siguienteFase,
          turnoDe: estado.turnoDe,
          pasoPreparacion: estado.pasoPreparacion,
        },
      ],
    };
  }

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
