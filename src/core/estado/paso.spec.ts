import fc from 'fast-check';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { clave } from '../mapa/coordenadas.js';
import { crearGameConfig } from '../partida/game-config.js';
import { simularPartida } from '../simulacion/simular.js';
import { accionesDisponibles } from './acciones.js';
import { aplicar } from './aplicar.js';
import { crearPartida } from './crear.js';
import { eventosPara } from './eventos.js';
import { crearMesa } from './mesa.js';
import { paso } from './paso.js';
import { conCambios, mesaDePrueba } from './pruebas.js';
import type { Accion, Estado } from './tipos.js';
import { vistaPara } from './vista.js';

const mesa = mesaDePrueba({ jugadores: 3 });
const inicial = crearPartida(mesa, ['a', 'b', 'c']);
const [a, b, c] = inicial.jugadores.map((j) => j.id) as [string, string, string];
const principal = conCambios(inicial, { fase: 'FASE_PRINCIPAL', pasoPreparacion: 6, turnoDe: 0 });

describe('paso: una jugada rechazada', () => {
  it('devuelve el rechazo tal cual y no genera notificaciones', () => {
    const accion: Accion = { tipo: 'TIRAR_DADOS', jugador: a };
    const r = paso(mesa, principal, accion, [a, b, null]);
    expect(r).toEqual({ ok: false, motivo: 'FASE_INCORRECTA' });
  });

  it('un jugador que no está en la partida es un error de programación: lanza', () => {
    const accion: Accion = { tipo: 'TERMINAR_TURNO', jugador: a };
    expect(() => paso(mesa, principal, accion, ['fantasma'])).toThrow(/fantasma/);
  });
});

describe('paso: una jugada aceptada', () => {
  const accion: Accion = { tipo: 'TERMINAR_TURNO', jugador: a };

  it('trae el estado nuevo y los eventos completos, iguales a los de aplicar', () => {
    const r = paso(mesa, principal, accion, [a]);
    const esperado = aplicar(mesa, principal, accion);
    if (!r.ok || !esperado.ok) throw new Error('se esperaba una jugada aceptada');
    expect(r.estado).toEqual(esperado.estado);
    expect(r.eventosCompletos).toEqual(esperado.eventos);
  });

  it('da una notificación por observador, en el orden pedido y sin repetir', () => {
    const r = paso(mesa, principal, accion, [b, null, a, b]);
    if (!r.ok) throw new Error(r.motivo);
    expect(r.notificaciones.map((n) => n.observador)).toEqual([b, null, a]);
  });

  it('cada notificación lleva la vista y los eventos filtrados para ese observador', () => {
    const r = paso(mesa, principal, accion, [a, b, null]);
    if (!r.ok) throw new Error(r.motivo);
    for (const n of r.notificaciones) {
      expect(n.vista).toEqual(vistaPara(r.estado, n.observador));
      expect(n.eventos).toEqual(eventosPara(r.eventosCompletos, n.observador));
    }
  });

  it('sin pedirlo no calcula acciones; pidiéndolo, las de cada jugador y ninguna al espectador', () => {
    const sin = paso(mesa, principal, accion, [a, null]);
    if (!sin.ok) throw new Error(sin.motivo);
    expect(sin.notificaciones.every((n) => n.acciones.length === 0)).toBe(true);

    const con = paso(mesa, principal, accion, [a, b, null], { incluirAcciones: true });
    if (!con.ok) throw new Error(con.motivo);
    const de = (obs: string | null) => con.notificaciones.find((n) => n.observador === obs)!;
    expect(de(b).acciones).toEqual(accionesDisponibles(mesa, con.estado, b));
    expect(de(a).acciones).toEqual(accionesDisponibles(mesa, con.estado, a));
    expect(de(null).acciones).toEqual([]);
  });

  it('no muta el estado recibido', () => {
    const copia = structuredClone(principal);
    paso(mesa, principal, accion, [a, b, null], { incluirAcciones: true });
    expect(principal).toEqual(copia);
  });
});

describe('paso: lo secreto solo llega a quien corresponde', () => {
  const destino = mesa.mapa.vertices[0]!.casillas[0]!;
  const vertice = mesa.mapa.vertices[0]!;
  const otraCasilla = mesa.mapa.casillas.find((x) => clave(x) !== clave(destino))!;
  const enRobo: Estado = produce(
    conCambios(principal, {
      fase: 'MOVER_LADRON',
      ladron: otraCasilla,
      edificios: { [vertice.id]: { dueno: b, tipo: 'POBLADO' } },
    }),
    (e) => {
      e.jugadores.find((j) => j.id === b)!.recursos = {
        MADERA: 0,
        LADRILLO: 0,
        OVEJA: 0,
        TRIGO: 2,
        MINERAL: 0,
      };
    },
  );
  const robar: Accion = { tipo: 'MOVER_LADRON', jugador: a, destino, victima: b };

  it('la carta robada solo la ven el ladrón y la víctima', () => {
    const r = paso(mesa, enRobo, robar, [a, b, c, null]);
    if (!r.ok) throw new Error(r.motivo);
    const recursoVisto = (obs: string | null) => {
      const ev = r.notificaciones
        .find((n) => n.observador === obs)!
        .eventos.find((e) => e.tipo === 'CARTA_ROBADA');
      return ev?.tipo === 'CARTA_ROBADA' ? ev.recurso : 'sin evento';
    };
    expect(recursoVisto(a)).toBe('TRIGO');
    expect(recursoVisto(b)).toBe('TRIGO');
    expect(recursoVisto(c)).toBeNull();
    expect(recursoVisto(null)).toBeNull();
  });

  it('los eventos completos del servidor sí traen la carta (son solo para guardar)', () => {
    const r = paso(mesa, enRobo, robar, [c]);
    if (!r.ok) throw new Error(r.motivo);
    const ev = r.eventosCompletos.find((e) => e.tipo === 'CARTA_ROBADA');
    expect(ev).toMatchObject({ recurso: 'TRIGO' });
  });
});

describe('paso: partidas completas simuladas (propiedad)', () => {
  const IDS = ['a', 'b', 'c'];

  it('en cada jugada, ninguna notificación filtra secretos y todas son coherentes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 9999 }), (n) => {
        const config = crearGameConfig({
          semillaMapa: `MAPA-PUBLICO-${n}`,
          semillaAzar: `AZAR-SECRETO-${n}`,
          jugadores: IDS.length,
          puntosVictoria: 5,
        });
        const sim = simularPartida(config, IDS, { semillaBot: `bot-${n}`, maxTurnos: 600 });
        const m = crearMesa(config);
        const observadores = [...IDS, null];
        let estado = crearPartida(m, IDS);
        for (const accion of sim.acciones) {
          const r = paso(m, estado, accion, observadores);
          if (!r.ok) throw new Error(r.motivo);
          expect(r.notificaciones).toHaveLength(observadores.length);
          for (const notif of r.notificaciones) {
            const json = JSON.stringify(notif);
            expect(json).not.toContain(config.semillaAzar);
            expect(notif.vista).toEqual(vistaPara(r.estado, notif.observador));
            for (const ev of notif.eventos) {
              if (ev.tipo === 'CARTA_ROBADA') {
                const involucrado =
                  notif.observador === ev.ladron || notif.observador === ev.victima;
                if (!involucrado) expect(ev.recurso).toBeNull();
              }
              if (ev.tipo === 'CARTA_DESARROLLO_COMPRADA' && notif.observador !== ev.jugador) {
                expect(ev.carta).toBeNull();
              }
              if (
                ev.tipo === 'CABALLERO_JUGADO' &&
                notif.observador !== ev.jugador &&
                notif.observador !== ev.victima
              ) {
                expect(ev.recursoRobado).toBeNull();
              }
            }
          }
          estado = r.estado;
        }
        expect(estado.fase).toBe('FIN');
      }),
      { numRuns: 3 },
    );
  }, 60_000);
});
