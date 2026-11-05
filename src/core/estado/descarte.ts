import { crearRng, mezclar } from '../reglas/azar.js';
import { RECURSOS, type Recurso } from '../reglas/recursos.js';
import type { Mesa } from './mesa.js';
import type { Accion, Decision, Estado, Evento } from './tipos.js';

/**
 * Valida el descarte de cartas cuando sale un 7 (fase DESCARTE).
 * Permite tanto el descarte manual como el descarte automático forzado por inactividad.
 */
export function decidirDescarte(_mesa: Mesa, estado: Estado, accion: Accion): Decision {
  if (accion.tipo !== 'DESCARTAR_RECURSOS' && accion.tipo !== 'DESCARTE_AUTOMATICO') {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }
  if (estado.fase !== 'DESCARTE') {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }

  const pendiente = estado.descartesPendientes[accion.jugador];
  if (!pendiente || pendiente <= 0) {
    return { ok: false, motivo: 'NO_DEBES_DESCARTAR' };
  }

  const jugador = estado.jugadores.find((j) => j.id === accion.jugador);
  if (!jugador) return { ok: false, motivo: 'JUGADOR_DESCONOCIDO' };

  let descarteElegido: Partial<Record<Recurso, number>>;

  if (accion.tipo === 'DESCARTAR_RECURSOS') {
    let totalDescartado = 0;
    const falta: Partial<Record<Recurso, number>> = {};

    for (const [rStr, n] of Object.entries(accion.recursos)) {
      const recurso = rStr as Recurso;
      const cant = n ?? 0;
      if (!Number.isInteger(cant) || cant < 0) {
        return { ok: false, motivo: 'CANTIDAD_DESCARTE_INCORRECTA' };
      }
      totalDescartado += cant;
      const enMano = jugador.recursos[recurso];
      if (cant > enMano) {
        falta[recurso] = cant - enMano;
      }
    }

    if (Object.keys(falta).length > 0) {
      return { ok: false, motivo: 'RECURSOS_INSUFICIENTES', falta };
    }

    if (totalDescartado !== pendiente) {
      return { ok: false, motivo: 'CANTIDAD_DESCARTE_INCORRECTA' };
    }

    descarteElegido = accion.recursos;
  } else {
    // DESCARTE_AUTOMATICO: expansión determinista de la mano y muestreo sin reemplazo
    const manoExpandida: Recurso[] = [];
    for (const r of RECURSOS) {
      for (let i = 0; i < jugador.recursos[r]; i++) {
        manoExpandida.push(r);
      }
    }

    const rng = crearRng(
      `${estado.config.semillaAzar}:descarte:${estado.tiradas}:${accion.jugador}`,
    );
    const barajada = mezclar(manoExpandida, rng);
    const elegidas = barajada.slice(0, pendiente);

    const conteo: Partial<Record<Recurso, number>> = {};
    for (const r of elegidas) {
      conteo[r] = (conteo[r] ?? 0) + 1;
    }
    descarteElegido = conteo;
  }

  const eventos: Evento[] = [
    {
      tipo: 'RECURSOS_DESCARTADOS',
      jugador: accion.jugador,
      recursos: descarteElegido,
    },
  ];

  // Si tras este descarte ya no quedan jugadores pendientes, se pasa a MOVER_LADRON
  const restantes = Object.keys(estado.descartesPendientes).filter((id) => id !== accion.jugador);
  if (restantes.length === 0) {
    eventos.push({
      tipo: 'FASE_CAMBIADA',
      fase: 'MOVER_LADRON',
      turnoDe: estado.turnoDe,
      pasoPreparacion: estado.pasoPreparacion,
    });
  }

  return { ok: true, eventos };
}
