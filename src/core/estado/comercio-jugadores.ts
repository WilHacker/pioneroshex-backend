import { RECURSOS, type Recurso } from '../reglas/recursos.js';
import { faltaPara } from './falta.js';
import type { Accion, Decision, Estado, Rechazo, Trato } from './tipos.js';

/** RECURSOS_INSUFICIENTES con lo que falta y de quién es la mano que no alcanza. */
function sinRecursos(
  jugador: { readonly id: string; readonly recursos: Readonly<Record<Recurso, number>> },
  requerido: Readonly<Record<Recurso, number>>,
): Rechazo | null {
  const falta = faltaPara(jugador.recursos, requerido);
  return falta
    ? { ok: false, motivo: 'RECURSOS_INSUFICIENTES', falta, detalle: { dueno: jugador.id } }
    : null;
}

function normalizar(parcial: Partial<Record<Recurso, number>>): Record<Recurso, number> {
  const res: Record<Recurso, number> = {
    MADERA: 0,
    LADRILLO: 0,
    OVEJA: 0,
    TRIGO: 0,
    MINERAL: 0,
  };
  for (const r of RECURSOS) {
    const val = parcial[r];
    if (typeof val === 'number' && Number.isInteger(val) && val > 0) {
      res[r] = val;
    }
  }
  return res;
}

function total(r: Record<Recurso, number>): number {
  return RECURSOS.reduce((acc, k) => acc + r[k], 0);
}

export function decidirProponerTrato(estado: Estado, accion: Accion): Decision {
  if (accion.tipo !== 'PROPONER_TRATO') {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }
  if (estado.fase !== 'FASE_PRINCIPAL') {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }

  if (estado.config.modoComercio === 'SOLO_BANCO') {
    return { ok: false, motivo: 'NO_PUEDES_COMERCIAR' };
  }

  const proponente = estado.jugadores.find((j) => j.id === accion.jugador);
  if (!proponente) {
    return { ok: false, motivo: 'JUGADOR_DESCONOCIDO' };
  }

  const jugadorEnTurno = estado.jugadores[estado.turnoDe]?.id;
  const esEnTurno = accion.jugador === jugadorEnTurno;
  const destinatario = accion.destinatario ?? null;

  // En el comercio privado no hay ofertas abiertas: hay que elegir con quién se comercia.
  if (destinatario === null && estado.config.modoComercio === 'PRIVADO') {
    return { ok: false, motivo: 'DESTINATARIO_INVALIDO' };
  }
  if (destinatario !== null) {
    const existeDestinatario = estado.jugadores.some((j) => j.id === destinatario);
    if (!existeDestinatario || destinatario === accion.jugador) {
      return { ok: false, motivo: 'DESTINATARIO_INVALIDO' };
    }
  }

  // Solo el jugador en turno puede iniciar propuestas de trato
  if (!esEnTurno) {
    return { ok: false, motivo: 'NO_ES_TU_TURNO' };
  }

  const tope = estado.config.maxOfertasPorTurno;
  if (tope > 0 && estado.ofertasEsteTurno >= tope) {
    return { ok: false, motivo: 'DEMASIADAS_OFERTAS' };
  }

  const entrega = normalizar(accion.entrega);
  const pide = normalizar(accion.pide);

  if (total(entrega) === 0) {
    return { ok: false, motivo: 'OFERTA_VACIA' };
  }
  if (total(pide) === 0) {
    return { ok: false, motivo: 'PETICION_VACIA' };
  }

  // No solapamiento: no se puede dar y pedir el mismo recurso
  for (const r of RECURSOS) {
    if (entrega[r] > 0 && pide[r] > 0) {
      return { ok: false, motivo: 'INTERCAMBIO_SOLAPADO' };
    }
  }

  const faltaEntrega = sinRecursos(proponente, entrega);
  if (faltaEntrega) return faltaEntrega;

  const id = `trato:${accion.jugador}:${estado.tratos.length + 1}:${estado.version}`;
  const trato: Trato = {
    id,
    proponente: accion.jugador,
    destinatario,
    entrega,
    pide,
    rechazadoPor: [],
  };

  return {
    ok: true,
    eventos: [{ tipo: 'TRATO_PROPUESTO', trato }],
  };
}

export function decidirAceptarTrato(estado: Estado, accion: Accion): Decision {
  if (accion.tipo !== 'ACEPTAR_TRATO') {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }
  if (estado.fase !== 'FASE_PRINCIPAL') {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }

  const trato = estado.tratos.find((t) => t.id === accion.tratoId);
  if (!trato) {
    return { ok: false, motivo: 'TRATO_INEXISTENTE' };
  }

  if (accion.jugador === trato.proponente) {
    return { ok: false, motivo: 'TRATO_NO_DIRIGIDO_A_TI' };
  }

  if (trato.destinatario !== null && trato.destinatario !== accion.jugador) {
    return { ok: false, motivo: 'TRATO_NO_DIRIGIDO_A_TI' };
  }

  const aceptante = estado.jugadores.find((j) => j.id === accion.jugador);
  const proponente = estado.jugadores.find((j) => j.id === trato.proponente);
  if (!aceptante || !proponente) {
    return { ok: false, motivo: 'JUGADOR_DESCONOCIDO' };
  }

  const faltaAceptante = sinRecursos(aceptante, trato.pide);
  if (faltaAceptante) return faltaAceptante;

  const faltaProponente = sinRecursos(proponente, trato.entrega);
  if (faltaProponente) return faltaProponente;

  return {
    ok: true,
    eventos: [
      {
        tipo: 'TRATO_ACEPTADO',
        tratoId: trato.id,
        proponente: trato.proponente,
        aceptante: accion.jugador,
        entrega: trato.entrega,
        pide: trato.pide,
      },
    ],
  };
}

export function decidirRechazarTrato(estado: Estado, accion: Accion): Decision {
  if (accion.tipo !== 'RECHAZAR_TRATO') {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }
  if (estado.fase !== 'FASE_PRINCIPAL') {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }

  const trato = estado.tratos.find((t) => t.id === accion.tratoId);
  if (!trato) {
    return { ok: false, motivo: 'TRATO_INEXISTENTE' };
  }

  if (accion.jugador === trato.proponente) {
    return { ok: false, motivo: 'TRATO_NO_DIRIGIDO_A_TI' };
  }

  if (trato.destinatario !== null && trato.destinatario !== accion.jugador) {
    return { ok: false, motivo: 'TRATO_NO_DIRIGIDO_A_TI' };
  }

  if (trato.rechazadoPor.includes(accion.jugador)) {
    return { ok: false, motivo: 'YA_RECHAZADO' };
  }

  return {
    ok: true,
    eventos: [
      {
        tipo: 'TRATO_RECHAZADO',
        tratoId: trato.id,
        jugador: accion.jugador,
      },
    ],
  };
}

export function decidirCancelarTrato(estado: Estado, accion: Accion): Decision {
  if (accion.tipo !== 'CANCELAR_TRATO') {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }
  if (estado.fase !== 'FASE_PRINCIPAL') {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }

  const trato = estado.tratos.find((t) => t.id === accion.tratoId);
  if (!trato) {
    return { ok: false, motivo: 'TRATO_INEXISTENTE' };
  }

  if (accion.jugador !== trato.proponente) {
    return { ok: false, motivo: 'NO_ES_TU_TRATO' };
  }

  return {
    ok: true,
    eventos: [
      {
        tipo: 'TRATO_CANCELADO',
        tratoId: trato.id,
        motivo: 'MANUAL',
      },
    ],
  };
}

export function decidirContraofertarTrato(estado: Estado, accion: Accion): Decision {
  if (accion.tipo !== 'CONTRAOFERTAR_TRATO') {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }
  if (estado.fase !== 'FASE_PRINCIPAL') {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }

  const tratoOriginal = estado.tratos.find((t) => t.id === accion.tratoIdOriginal);
  if (!tratoOriginal) {
    return { ok: false, motivo: 'TRATO_INEXISTENTE' };
  }

  if (accion.jugador === tratoOriginal.proponente) {
    return { ok: false, motivo: 'DESTINATARIO_INVALIDO' };
  }

  const proponente = estado.jugadores.find((j) => j.id === accion.jugador);
  if (!proponente) {
    return { ok: false, motivo: 'JUGADOR_DESCONOCIDO' };
  }

  const entrega = normalizar(accion.entrega);
  const pide = normalizar(accion.pide);

  if (total(entrega) === 0) {
    return { ok: false, motivo: 'OFERTA_VACIA' };
  }
  if (total(pide) === 0) {
    return { ok: false, motivo: 'PETICION_VACIA' };
  }

  for (const r of RECURSOS) {
    if (entrega[r] > 0 && pide[r] > 0) {
      return { ok: false, motivo: 'INTERCAMBIO_SOLAPADO' };
    }
  }

  const faltaEntrega = sinRecursos(proponente, entrega);
  if (faltaEntrega) return faltaEntrega;

  const id = `trato:${accion.jugador}:${estado.tratos.length + 1}:${estado.version}`;
  const trato: Trato = {
    id,
    proponente: accion.jugador,
    destinatario: tratoOriginal.proponente,
    entrega,
    pide,
    rechazadoPor: [],
    contraofertaDe: tratoOriginal.id,
  };

  return {
    ok: true,
    eventos: [{ tipo: 'TRATO_PROPUESTO', trato }],
  };
}
