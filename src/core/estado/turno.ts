import { RONDAS_ARRANQUE_PROTEGIDO } from '../partida/game-config.js';
import { RECURSOS } from '../reglas/recursos.js';
import { tirarDados } from './dados.js';
import type { Mesa } from './mesa.js';
import { repartirProduccion } from './produccion.js';
import type { Accion, CausaAccion, Decision, Estado, Evento } from './tipos.js';

/** Tira los dados (solo en PRE_TIRADA), reparte producción o inicia robo con 7. */
export function decidirTirada(
  mesa: Mesa,
  estado: Estado,
  accion: Accion,
  causa: CausaAccion = 'VOLUNTARIA',
): Decision {
  if (accion.tipo !== 'TIRAR_DADOS' || estado.fase !== 'PRE_TIRADA') {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }
  const { semillaAzar, modoDados, arranqueProtegido, jugadores } = estado.config;
  const dados = tirarDados(semillaAzar, estado.tiradas, modoDados, {
    sinSieteHasta: arranqueProtegido ? jugadores * RONDAS_ARRANQUE_PROTEGIDO : 0,
  });
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
        { tipo: 'DADOS_TIRADOS', jugador: accion.jugador, dados, causa },
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
      { tipo: 'DADOS_TIRADOS', jugador: accion.jugador, dados, causa },
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

/** Termina el turno (solo en FASE_PRINCIPAL) y cede el turno al siguiente jugador (o inicia fase especial en modo B). */
export function decidirFinDeTurno(
  _mesa: Mesa,
  estado: Estado,
  accion: Accion,
  causa: CausaAccion = 'VOLUNTARIA',
): Decision {
  if (accion.tipo !== 'TERMINAR_TURNO' || estado.fase !== 'FASE_PRINCIPAL') {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }
  const esModoB = estado.config.turnRuleMode === 'B' && estado.jugadores.length >= 5;
  if (esModoB) {
    const primerConstructor = (estado.turnoDe + 1) % estado.jugadores.length;
    return {
      ok: true,
      eventos: [
        {
          tipo: 'FASE_ESPECIAL_INICIADA',
          turnoOriginal: estado.turnoDe,
          primerConstructor,
        },
        {
          tipo: 'FASE_CAMBIADA',
          fase: 'CONSTRUCCION_ESPECIAL',
          turnoDe: estado.turnoDe,
          pasoPreparacion: estado.pasoPreparacion,
        },
      ],
    };
  }

  const siguiente = (estado.turnoDe + 1) % estado.jugadores.length;
  return {
    ok: true,
    eventos: [{ tipo: 'TURNO_TERMINADO', jugador: accion.jugador, siguiente, causa }],
  };
}

/** Cede el turno especial de construcción al siguiente rival (o cierra la fase si terminó la ronda). */
export function decidirPasarConstruccionEspecial(
  _mesa: Mesa,
  estado: Estado,
  accion: Accion,
  causa: CausaAccion = 'VOLUNTARIA',
): Decision {
  if (accion.tipo !== 'PASAR_CONSTRUCCION_ESPECIAL' || estado.fase !== 'CONSTRUCCION_ESPECIAL') {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }
  if (estado.turnoEspecialDe === null) {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }
  const jugadorEspecial = estado.jugadores[estado.turnoEspecialDe];
  if (!jugadorEspecial || jugadorEspecial.id !== accion.jugador) {
    return { ok: false, motivo: 'NO_ES_TU_TURNO' };
  }

  const siguiente = (estado.turnoEspecialDe + 1) % estado.jugadores.length;
  if (siguiente === estado.turnoDe) {
    const siguienteNormal = (estado.turnoDe + 1) % estado.jugadores.length;
    return {
      ok: true,
      eventos: [
        {
          tipo: 'CONSTRUCCION_ESPECIAL_PASADA',
          jugador: accion.jugador,
          siguienteConstructor: null,
          causa,
        },
        {
          tipo: 'TURNO_TERMINADO',
          jugador: estado.jugadores[estado.turnoDe]!.id,
          siguiente: siguienteNormal,
          causa,
        },
      ],
    };
  }

  return {
    ok: true,
    eventos: [
      {
        tipo: 'CONSTRUCCION_ESPECIAL_PASADA',
        jugador: accion.jugador,
        siguienteConstructor: siguiente,
        causa,
      },
    ],
  };
}
