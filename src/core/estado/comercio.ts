import { mejorRazon } from '../reglas/puertos.js';
import { RECURSOS } from '../reglas/recursos.js';
import type { Mesa } from './mesa.js';
import type { Accion, Decision, Estado } from './tipos.js';

/**
 * Valida un cambio con la banca (4:1 por defecto, o 3:1 / 2:1 con puertos marítimos).
 * Solo se permite en FASE_PRINCIPAL y durante el turno del jugador.
 */
export function decidirCambioConBanca(mesa: Mesa, estado: Estado, accion: Accion): Decision {
  if (accion.tipo !== 'CAMBIAR_CON_BANCA') return { ok: false, motivo: 'FASE_INCORRECTA' };
  if (estado.fase !== 'FASE_PRINCIPAL') return { ok: false, motivo: 'FASE_INCORRECTA' };

  if (!RECURSOS.includes(accion.entrega) || !RECURSOS.includes(accion.recibe)) {
    return { ok: false, motivo: 'RECURSO_INVALIDO' };
  }
  if (accion.entrega === accion.recibe) {
    return { ok: false, motivo: 'MISMO_RECURSO' };
  }

  const jugador = estado.jugadores.find((j) => j.id === accion.jugador);
  if (!jugador) return { ok: false, motivo: 'JUGADOR_DESCONOCIDO' };

  const verticesPropios = new Set(
    Object.keys(estado.edificios).filter((v) => estado.edificios[v]?.dueno === accion.jugador),
  );

  const ratio = mejorRazon(mesa.puertos, verticesPropios, accion.entrega);

  if (jugador.recursos[accion.entrega] < ratio) {
    return {
      ok: false,
      motivo: 'RECURSOS_INSUFICIENTES',
      falta: { [accion.entrega]: ratio - jugador.recursos[accion.entrega] },
    };
  }

  if (estado.banco[accion.recibe] < 1) {
    return {
      ok: false,
      motivo: 'BANCO_AGOTADO',
      detalle: { recurso: accion.recibe, pedido: 1, disponible: estado.banco[accion.recibe] },
    };
  }

  return {
    ok: true,
    eventos: [
      {
        tipo: 'CAMBIO_CON_BANCA_REALIZADO',
        jugador: accion.jugador,
        entrega: accion.entrega,
        cantidadEntregada: ratio,
        recibe: accion.recibe,
        cantidadRecibida: 1,
      },
    ],
  };
}
