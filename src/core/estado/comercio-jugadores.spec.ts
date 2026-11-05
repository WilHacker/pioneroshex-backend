import { describe, expect, it } from 'vitest';
import {
  decidirAceptarTrato,
  decidirCancelarTrato,
  decidirContraofertarTrato,
  decidirProponerTrato,
  decidirRechazarTrato,
} from './comercio-jugadores.js';
import { crearPartida } from './crear.js';
import { conCambios, mesaDePrueba } from './pruebas.js';
import type { Estado, Trato } from './tipos.js';

const mesa = mesaDePrueba();
const base = crearPartida(mesa, ['alice', 'bob', 'carol', 'dave']);
const [j0, j1, j2] = base.jugadores.map((j) => j.id) as [string, string, string];

function estadoEnPrincipal(): Estado {
  return conCambios(base, {
    fase: 'FASE_PRINCIPAL',
    turnoDe: 0, // j0 en turno
    jugadores: base.jugadores.map((j, i) => ({
      ...j,
      recursos:
        i === 0
          ? { MADERA: 2, LADRILLO: 2, OVEJA: 0, TRIGO: 0, MINERAL: 0 }
          : i === 1
            ? { MADERA: 0, LADRILLO: 0, OVEJA: 2, TRIGO: 2, MINERAL: 0 }
            : { MADERA: 1, LADRILLO: 1, OVEJA: 1, TRIGO: 1, MINERAL: 1 },
    })),
  });
}

describe('comercio entre jugadores', () => {
  describe('decidirProponerTrato', () => {
    it('el jugador en turno propone un trato abierto a todos', () => {
      const estado = estadoEnPrincipal();
      const decision = decidirProponerTrato(estado, {
        tipo: 'PROPONER_TRATO',
        jugador: j0,
        entrega: { MADERA: 1 },
        pide: { OVEJA: 1 },
      });
      expect(decision.ok).toBe(true);
      if (!decision.ok) return;
      expect(decision.eventos).toHaveLength(1);
      const ev = decision.eventos[0];
      expect(ev?.tipo).toBe('TRATO_PROPUESTO');
      if (ev?.tipo === 'TRATO_PROPUESTO') {
        expect(ev.trato.proponente).toBe(j0);
        expect(ev.trato.destinatario).toBeNull();
        expect(ev.trato.entrega.MADERA).toBe(1);
        expect(ev.trato.pide.OVEJA).toBe(1);
      }
    });

    it('un rival no puede iniciar tratos fuera de su turno', () => {
      const estado = estadoEnPrincipal();
      const decision = decidirProponerTrato(estado, {
        tipo: 'PROPONER_TRATO',
        jugador: j1,
        entrega: { OVEJA: 1 },
        pide: { MADERA: 1 },
        destinatario: j0,
      });
      expect(decision.ok).toBe(false);
      if (decision.ok) return;
      expect(decision.motivo).toBe('NO_ES_TU_TURNO');
    });

    it('rechaza propuesta con entrega vacía', () => {
      const estado = estadoEnPrincipal();
      const decision = decidirProponerTrato(estado, {
        tipo: 'PROPONER_TRATO',
        jugador: j0,
        entrega: {},
        pide: { OVEJA: 1 },
      });
      expect(decision.ok).toBe(false);
      if (decision.ok) return;
      expect(decision.motivo).toBe('OFERTA_VACIA');
    });

    it('rechaza propuesta con petición vacía', () => {
      const estado = estadoEnPrincipal();
      const decision = decidirProponerTrato(estado, {
        tipo: 'PROPONER_TRATO',
        jugador: j0,
        entrega: { MADERA: 1 },
        pide: {},
      });
      expect(decision.ok).toBe(false);
      if (decision.ok) return;
      expect(decision.motivo).toBe('PETICION_VACIA');
    });

    it('rechaza propuesta con solapamiento de recursos (trigo por trigo)', () => {
      const estado = estadoEnPrincipal();
      const decision = decidirProponerTrato(estado, {
        tipo: 'PROPONER_TRATO',
        jugador: j0,
        entrega: { MADERA: 1 },
        pide: { MADERA: 1 },
      });
      expect(decision.ok).toBe(false);
      if (decision.ok) return;
      expect(decision.motivo).toBe('INTERCAMBIO_SOLAPADO');
    });

    it('rechaza propuesta si el proponente no tiene los recursos ofrecidos', () => {
      const estado = estadoEnPrincipal();
      const decision = decidirProponerTrato(estado, {
        tipo: 'PROPONER_TRATO',
        jugador: j0,
        entrega: { MINERAL: 1 }, // j0 tiene 0
        pide: { OVEJA: 1 },
      });
      expect(decision.ok).toBe(false);
      if (decision.ok) return;
      expect(decision.motivo).toBe('RECURSOS_INSUFICIENTES');
      expect(decision.falta).toEqual({ MINERAL: 1 });
      expect(decision.detalle).toEqual({ dueno: j0 });
    });

    it('rechaza si la fase no es FASE_PRINCIPAL', () => {
      const estado = conCambios(base, { fase: 'PRE_TIRADA' });
      const decision = decidirProponerTrato(estado, {
        tipo: 'PROPONER_TRATO',
        jugador: j0,
        entrega: { MADERA: 1 },
        pide: { OVEJA: 1 },
      });
      expect(decision.ok).toBe(false);
      if (decision.ok) return;
      expect(decision.motivo).toBe('FASE_INCORRECTA');
    });
  });

  describe('decidirAceptarTrato', () => {
    const tratoAbierto: Trato = {
      id: 'trato-1',
      proponente: j0,
      destinatario: null,
      entrega: { MADERA: 1, LADRILLO: 0, OVEJA: 0, TRIGO: 0, MINERAL: 0 },
      pide: { MADERA: 0, LADRILLO: 0, OVEJA: 1, TRIGO: 0, MINERAL: 0 },
      rechazadoPor: [],
    };

    it('un rival con recursos suficientes acepta un trato abierto', () => {
      const estado = conCambios(estadoEnPrincipal(), { tratos: [tratoAbierto] });
      const decision = decidirAceptarTrato(estado, {
        tipo: 'ACEPTAR_TRATO',
        jugador: j1, // j1 tiene 2 ovejas
        tratoId: 'trato-1',
      });
      expect(decision.ok).toBe(true);
      if (!decision.ok) return;
      expect(decision.eventos[0]?.tipo).toBe('TRATO_ACEPTADO');
    });

    it('el propio proponente no puede aceptar su trato', () => {
      const estado = conCambios(estadoEnPrincipal(), { tratos: [tratoAbierto] });
      const decision = decidirAceptarTrato(estado, {
        tipo: 'ACEPTAR_TRATO',
        jugador: j0,
        tratoId: 'trato-1',
      });
      expect(decision.ok).toBe(false);
      if (decision.ok) return;
      expect(decision.motivo).toBe('TRATO_NO_DIRIGIDO_A_TI');
    });

    it('rechaza si el aceptante no tiene los recursos pedidos', () => {
      const estado = conCambios(estadoEnPrincipal(), {
        tratos: [
          {
            ...tratoAbierto,
            pide: { MADERA: 0, LADRILLO: 0, OVEJA: 0, TRIGO: 0, MINERAL: 5 }, // j1 tiene 0
          },
        ],
      });
      const decision = decidirAceptarTrato(estado, {
        tipo: 'ACEPTAR_TRATO',
        jugador: j1,
        tratoId: 'trato-1',
      });
      expect(decision.ok).toBe(false);
      if (decision.ok) return;
      expect(decision.motivo).toBe('RECURSOS_INSUFICIENTES');
      expect(decision.falta).toEqual({ MINERAL: 5 });
      expect(decision.detalle).toEqual({ dueno: j1 });
    });

    it('rechaza si el trato estaba dirigido a otro jugador', () => {
      const estado = conCambios(estadoEnPrincipal(), {
        tratos: [{ ...tratoAbierto, destinatario: j2 }],
      });
      const decision = decidirAceptarTrato(estado, {
        tipo: 'ACEPTAR_TRATO',
        jugador: j1,
        tratoId: 'trato-1',
      });
      expect(decision.ok).toBe(false);
      if (decision.ok) return;
      expect(decision.motivo).toBe('TRATO_NO_DIRIGIDO_A_TI');
    });
  });

  describe('decidirRechazarTrato y decidirCancelarTrato', () => {
    const tratoAbierto: Trato = {
      id: 'trato-1',
      proponente: j0,
      destinatario: null,
      entrega: { MADERA: 1, LADRILLO: 0, OVEJA: 0, TRIGO: 0, MINERAL: 0 },
      pide: { MADERA: 0, LADRILLO: 0, OVEJA: 1, TRIGO: 0, MINERAL: 0 },
      rechazadoPor: [],
    };

    it('el proponente puede cancelar su propio trato', () => {
      const estado = conCambios(estadoEnPrincipal(), { tratos: [tratoAbierto] });
      const decision = decidirCancelarTrato(estado, {
        tipo: 'CANCELAR_TRATO',
        jugador: j0,
        tratoId: 'trato-1',
      });
      expect(decision.ok).toBe(true);
      if (!decision.ok) return;
      expect(decision.eventos[0]?.tipo).toBe('TRATO_CANCELADO');
    });

    it('un rival no puede cancelar el trato del proponente', () => {
      const estado = conCambios(estadoEnPrincipal(), { tratos: [tratoAbierto] });
      const decision = decidirCancelarTrato(estado, {
        tipo: 'CANCELAR_TRATO',
        jugador: j1,
        tratoId: 'trato-1',
      });
      expect(decision.ok).toBe(false);
      if (decision.ok) return;
      expect(decision.motivo).toBe('NO_ES_TU_TRATO');
    });

    it('un rival puede rechazar el trato', () => {
      const estado = conCambios(estadoEnPrincipal(), { tratos: [tratoAbierto] });
      const decision = decidirRechazarTrato(estado, {
        tipo: 'RECHAZAR_TRATO',
        jugador: j1,
        tratoId: 'trato-1',
      });
      expect(decision.ok).toBe(true);
      if (!decision.ok) return;
      expect(decision.eventos[0]?.tipo).toBe('TRATO_RECHAZADO');
    });
  });

  describe('decidirContraofertarTrato', () => {
    const tratoOriginal: Trato = {
      id: 'trato-1',
      proponente: j0,
      destinatario: null,
      entrega: { MADERA: 1, LADRILLO: 0, OVEJA: 0, TRIGO: 0, MINERAL: 0 },
      pide: { MADERA: 0, LADRILLO: 0, OVEJA: 2, TRIGO: 0, MINERAL: 0 },
      rechazadoPor: [],
    };

    it('un rival contraoferta pidiendo menos o cambiando el intercambio', () => {
      const estado = conCambios(estadoEnPrincipal(), { tratos: [tratoOriginal] });
      const decision = decidirContraofertarTrato(estado, {
        tipo: 'CONTRAOFERTAR_TRATO',
        jugador: j1,
        tratoIdOriginal: 'trato-1',
        entrega: { OVEJA: 1 },
        pide: { MADERA: 1 },
      });
      expect(decision.ok).toBe(true);
      if (!decision.ok) return;
      const ev = decision.eventos[0];
      expect(ev?.tipo).toBe('TRATO_PROPUESTO');
      if (ev?.tipo === 'TRATO_PROPUESTO') {
        expect(ev.trato.proponente).toBe(j1);
        expect(ev.trato.destinatario).toBe(j0);
        expect(ev.trato.contraofertaDe).toBe('trato-1');
      }
    });
  });
});
