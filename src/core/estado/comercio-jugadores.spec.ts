import { describe, expect, it } from 'vitest';
import {
  decidirAceptarTrato,
  decidirCancelarTrato,
  decidirConfirmarTrato,
  decidirContraofertarTrato,
  decidirProponerTrato,
  decidirRechazarTrato,
} from './comercio-jugadores.js';
import { aplicar } from './aplicar.js';
import { crearPartida } from './crear.js';
import { conCambios, mesaDePrueba } from './pruebas.js';
import type { Estado, Trato } from './tipos.js';

const mesa = mesaDePrueba();
const base = crearPartida(mesa, ['alice', 'bob', 'carol', 'dave']);
const [j0, j1, j2, j3] = base.jugadores.map((j) => j.id) as [string, string, string, string];

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
      aceptadoPor: [],
    };

    it('un rival con recursos suficientes acepta un trato abierto: queda a la espera de los demás', () => {
      const estado = conCambios(estadoEnPrincipal(), { tratos: [tratoAbierto] });
      const decision = decidirAceptarTrato(estado, {
        tipo: 'ACEPTAR_TRATO',
        jugador: j1, // j1 tiene 2 ovejas
        tratoId: 'trato-1',
      });
      expect(decision.ok).toBe(true);
      if (!decision.ok) return;
      expect(decision.eventos).toEqual([
        { tipo: 'TRATO_PREACEPTADO', tratoId: 'trato-1', jugador: j1, proponente: j0 },
      ]);
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
      aceptadoPor: [],
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
      aceptadoPor: [],
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

  /**
   * Una oferta a todos: cada rival acepta o rechaza. Si ya respondieron todos y aceptó uno solo, se
   * cierra con él; si aceptan varios, el proponente elige con quién (y puede hacerlo antes de que
   * respondan todos).
   */
  describe('aceptar una oferta abierta y elegir con quién se cierra', () => {
    const abierto: Trato = {
      id: 'trato-1',
      proponente: j0,
      destinatario: null,
      entrega: { MADERA: 1, LADRILLO: 0, OVEJA: 0, TRIGO: 0, MINERAL: 0 },
      pide: { MADERA: 0, LADRILLO: 0, OVEJA: 1, TRIGO: 0, MINERAL: 0 },
      rechazadoPor: [],
      aceptadoPor: [],
    };
    const conTrato = (cambios: Partial<Trato> = {}): Estado =>
      conCambios(estadoEnPrincipal(), { tratos: [{ ...abierto, ...cambios }] });
    const aceptar = (estado: Estado, jugador: string) =>
      decidirAceptarTrato(estado, { tipo: 'ACEPTAR_TRATO', jugador, tratoId: 'trato-1' });
    const rechazar = (estado: Estado, jugador: string) =>
      decidirRechazarTrato(estado, { tipo: 'RECHAZAR_TRATO', jugador, tratoId: 'trato-1' });
    const confirmar = (estado: Estado, jugador: string, con: string) =>
      decidirConfirmarTrato(estado, {
        tipo: 'CONFIRMAR_TRATO',
        jugador,
        tratoId: 'trato-1',
        con,
      });
    const eventos = (d: ReturnType<typeof aceptar>) => {
      if (!d.ok) throw new Error(`Se rechazó: ${d.motivo}`);
      return d.eventos;
    };
    const cierre = (aceptante: string) => ({
      tipo: 'TRATO_ACEPTADO',
      tratoId: 'trato-1',
      proponente: j0,
      aceptante,
      entrega: abierto.entrega,
      pide: abierto.pide,
    });

    it('si aún faltan respuestas, aceptar solo queda registrado', () => {
      expect(eventos(aceptar(conTrato(), j1))).toEqual([
        { tipo: 'TRATO_PREACEPTADO', tratoId: 'trato-1', jugador: j1, proponente: j0 },
      ]);
    });

    it('si todos los demás ya rechazaron y acepta uno, se cierra directo con él', () => {
      const estado = conTrato({ rechazadoPor: [j2, j3] });
      expect(eventos(aceptar(estado, j1))).toEqual([cierre(j1)]);
    });

    it('si los demás ya respondieron y hay varios que aceptaron, queda a elegir del proponente', () => {
      const estado = conTrato({ aceptadoPor: [j2], rechazadoPor: [j3] });
      expect(eventos(aceptar(estado, j1))).toEqual([
        { tipo: 'TRATO_PREACEPTADO', tratoId: 'trato-1', jugador: j1, proponente: j0 },
      ]);
    });

    it('una oferta dirigida a un solo jugador se cierra en cuanto acepta', () => {
      const estado = conTrato({ destinatario: j1 });
      expect(eventos(aceptar(estado, j1))).toEqual([cierre(j1)]);
    });

    it('rechazar el último pendiente cierra el trato con el único que aceptó', () => {
      const estado = conTrato({ aceptadoPor: [j1], rechazadoPor: [j2] });
      expect(eventos(rechazar(estado, j3))).toEqual([
        { tipo: 'TRATO_RECHAZADO', tratoId: 'trato-1', jugador: j3 },
        cierre(j1),
      ]);
    });

    it('rechazar el último pendiente con varios aceptantes deja elegir al proponente', () => {
      const estado = conTrato({ aceptadoPor: [j1, j2] });
      expect(eventos(rechazar(estado, j3))).toEqual([
        { tipo: 'TRATO_RECHAZADO', tratoId: 'trato-1', jugador: j3 },
      ]);
    });

    it('rechazar sin que hayan respondido todos solo registra el rechazo', () => {
      const estado = conTrato({ aceptadoPor: [j1] });
      expect(eventos(rechazar(estado, j2))).toEqual([
        { tipo: 'TRATO_RECHAZADO', tratoId: 'trato-1', jugador: j2 },
      ]);
    });

    it('si rechazan todos, solo se registra el rechazo (el trato se cae)', () => {
      const estado = conTrato({ rechazadoPor: [j1, j2] });
      expect(eventos(rechazar(estado, j3))).toEqual([
        { tipo: 'TRATO_RECHAZADO', tratoId: 'trato-1', jugador: j3 },
      ]);
    });

    it('no se puede aceptar dos veces ni aceptar lo que ya rechazaste', () => {
      expect(aceptar(conTrato({ aceptadoPor: [j1] }), j1)).toMatchObject({
        ok: false,
        motivo: 'YA_ACEPTADO',
      });
      expect(aceptar(conTrato({ rechazadoPor: [j1] }), j1)).toMatchObject({
        ok: false,
        motivo: 'YA_RECHAZADO',
      });
    });

    it('quien ya aceptó no puede rechazar después', () => {
      expect(rechazar(conTrato({ aceptadoPor: [j1] }), j1)).toMatchObject({
        ok: false,
        motivo: 'YA_ACEPTADO',
      });
    });

    it('el proponente elige con quién cerrar, entre quienes aceptaron', () => {
      const estado = conTrato({ aceptadoPor: [j1, j2] });
      expect(eventos(confirmar(estado, j0, j2))).toEqual([cierre(j2)]);
      expect(eventos(confirmar(estado, j0, j1))).toEqual([cierre(j1)]);
    });

    it('puede cerrar con el primero que aceptó sin esperar a los demás', () => {
      const estado = conTrato({ aceptadoPor: [j1] });
      expect(eventos(confirmar(estado, j0, j1))).toEqual([cierre(j1)]);
    });

    it('no se puede cerrar con alguien que no aceptó', () => {
      const estado = conTrato({ aceptadoPor: [j1] });
      expect(confirmar(estado, j0, j2)).toMatchObject({
        ok: false,
        motivo: 'DESTINATARIO_INVALIDO',
      });
    });

    it('solo el proponente confirma', () => {
      const estado = conTrato({ aceptadoPor: [j1] });
      expect(confirmar(estado, j1, j1)).toMatchObject({ ok: false, motivo: 'NO_ES_TU_TRATO' });
    });

    it('un trato que no existe no se confirma', () => {
      expect(
        decidirConfirmarTrato(conTrato(), {
          tipo: 'CONFIRMAR_TRATO',
          jugador: j0,
          tratoId: 'otro',
          con: j1,
        }),
      ).toMatchObject({ ok: false, motivo: 'TRATO_INEXISTENTE' });
    });

    it('si a quien confirmas ya no le alcanza lo que pide la oferta, no se cierra', () => {
      const estado = conCambios(conTrato({ aceptadoPor: [j1] }), {
        jugadores: estadoEnPrincipal().jugadores.map((j) =>
          j.id === j1 ? { ...j, recursos: { ...j.recursos, OVEJA: 0 } } : j,
        ),
      });
      expect(confirmar(estado, j0, j1)).toMatchObject({
        ok: false,
        motivo: 'RECURSOS_INSUFICIENTES',
        falta: { OVEJA: 1 },
      });
    });

    it('si el último en rechazar deja un único aceptante al que ya no le alcanza, el trato queda abierto', () => {
      const estado = conCambios(conTrato({ aceptadoPor: [j1], rechazadoPor: [j2] }), {
        jugadores: estadoEnPrincipal().jugadores.map((j) =>
          j.id === j1 ? { ...j, recursos: { ...j.recursos, OVEJA: 0 } } : j,
        ),
      });
      expect(eventos(rechazar(estado, j3))).toEqual([
        { tipo: 'TRATO_RECHAZADO', tratoId: 'trato-1', jugador: j3 },
      ]);
    });
  });

  describe('recorridos completos con aplicar', () => {
    const proponer = (): Estado => {
      const r = aplicar(mesa, estadoEnPrincipal(), {
        tipo: 'PROPONER_TRATO',
        jugador: j0,
        entrega: { MADERA: 1 },
        pide: { OVEJA: 1 },
      });
      if (!r.ok) throw new Error(`No se pudo proponer: ${r.motivo}`);
      return r.estado;
    };
    const paso = (estado: Estado, accion: Parameters<typeof aplicar>[2]): Estado => {
      const r = aplicar(mesa, estado, accion);
      if (!r.ok) throw new Error(`Se rechazó ${accion.tipo}: ${r.motivo}`);
      return r.estado;
    };
    const manoDe = (estado: Estado, id: string) =>
      estado.jugadores.find((j) => j.id === id)!.recursos;
    const idDelTrato = (estado: Estado): string => estado.tratos[0]!.id;

    it('varios aceptan: el trato espera, y al elegir a uno se hace el intercambio con ese', () => {
      let estado = proponer();
      const tratoId = idDelTrato(estado);
      estado = paso(estado, { tipo: 'ACEPTAR_TRATO', jugador: j1, tratoId });
      estado = paso(estado, { tipo: 'ACEPTAR_TRATO', jugador: j2, tratoId });
      estado = paso(estado, { tipo: 'RECHAZAR_TRATO', jugador: j3, tratoId });
      // Respondieron todos y aceptaron dos: sigue abierto, esperando que el proponente elija.
      expect(estado.tratos).toHaveLength(1);
      expect(estado.tratos[0]!.aceptadoPor).toEqual([j1, j2]);

      const antes1 = manoDe(estado, j1);
      estado = paso(estado, { tipo: 'CONFIRMAR_TRATO', jugador: j0, tratoId, con: j2 });
      expect(estado.tratos).toHaveLength(0);
      expect(manoDe(estado, j0)).toMatchObject({ MADERA: 1, OVEJA: 1 });
      expect(manoDe(estado, j2)).toMatchObject({ MADERA: 2, OVEJA: 0 });
      expect(manoDe(estado, j1)).toEqual(antes1); // al que no elegí no le pasa nada
    });

    it('todos rechazan menos uno: se cierra solo con ese, aunque acepte el último', () => {
      let estado = proponer();
      const tratoId = idDelTrato(estado);
      estado = paso(estado, { tipo: 'RECHAZAR_TRATO', jugador: j2, tratoId });
      estado = paso(estado, { tipo: 'RECHAZAR_TRATO', jugador: j3, tratoId });
      estado = paso(estado, { tipo: 'ACEPTAR_TRATO', jugador: j1, tratoId });
      expect(estado.tratos).toHaveLength(0);
      expect(manoDe(estado, j0)).toMatchObject({ MADERA: 1, OVEJA: 1 });
      expect(manoDe(estado, j1)).toMatchObject({ MADERA: 1, OVEJA: 1 });
    });

    it('uno acepta primero y los demás rechazan después: se cierra con el que aceptó', () => {
      let estado = proponer();
      const tratoId = idDelTrato(estado);
      estado = paso(estado, { tipo: 'ACEPTAR_TRATO', jugador: j1, tratoId });
      expect(estado.tratos).toHaveLength(1);
      estado = paso(estado, { tipo: 'RECHAZAR_TRATO', jugador: j2, tratoId });
      expect(estado.tratos).toHaveLength(1);
      estado = paso(estado, { tipo: 'RECHAZAR_TRATO', jugador: j3, tratoId });
      expect(estado.tratos).toHaveLength(0);
      expect(manoDe(estado, j1)).toMatchObject({ MADERA: 1, OVEJA: 1 });
    });

    it('si rechazan todos, la oferta desaparece y nadie intercambia', () => {
      let estado = proponer();
      const tratoId = idDelTrato(estado);
      const manoInicial = manoDe(estado, j0);
      for (const j of [j1, j2, j3]) {
        estado = paso(estado, { tipo: 'RECHAZAR_TRATO', jugador: j, tratoId });
      }
      expect(estado.tratos).toHaveLength(0);
      expect(manoDe(estado, j0)).toEqual(manoInicial);
    });

    it('el proponente puede cerrar con el primero que aceptó sin esperar a los demás', () => {
      let estado = proponer();
      const tratoId = idDelTrato(estado);
      estado = paso(estado, { tipo: 'ACEPTAR_TRATO', jugador: j1, tratoId });
      estado = paso(estado, { tipo: 'CONFIRMAR_TRATO', jugador: j0, tratoId, con: j1 });
      expect(estado.tratos).toHaveLength(0);
      expect(manoDe(estado, j1)).toMatchObject({ MADERA: 1, OVEJA: 1 });
    });

    it('una oferta a un solo jugador se cierra al aceptar', () => {
      const propuesto = paso(estadoEnPrincipal(), {
        tipo: 'PROPONER_TRATO',
        jugador: j0,
        entrega: { MADERA: 1 },
        pide: { OVEJA: 1 },
        destinatario: j1,
      });
      const estado = paso(propuesto, {
        tipo: 'ACEPTAR_TRATO',
        jugador: j1,
        tratoId: idDelTrato(propuesto),
      });
      expect(estado.tratos).toHaveLength(0);
      expect(manoDe(estado, j1)).toMatchObject({ MADERA: 1, OVEJA: 1 });
    });
  });
});
