import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RECURSOS, type Recurso } from '../reglas/recursos.js';
import { crearPartida } from './crear.js';
import { conCambios, mesaDePrueba } from './pruebas.js';
import type { Estado } from './tipos.js';
import { vistaPara } from './vista.js';

const SEMILLA_MAPA = 'MAPA-PUBLICO-123';
const SEMILLA_AZAR = 'SEMILLA-SECRETA-123';
const mesa = mesaDePrueba({ semillaMapa: SEMILLA_MAPA, semillaAzar: SEMILLA_AZAR });
const base = crearPartida(mesa, ['a', 'b', 'c', 'd']);
const [j0, j1, j2] = base.jugadores.map((j) => j.id) as [string, string, string];
const [v1, v2, v3] = mesa.mapa.vertices.map((v) => v.id) as [string, string, string];
const [e1] = mesa.mapa.aristas.map((a) => a.id) as [string];

const mano = (m: number, l: number, o: number, t: number, n: number): Record<Recurso, number> => ({
  MADERA: m,
  LADRILLO: l,
  OVEJA: o,
  TRIGO: t,
  MINERAL: n,
});

function conManos(manos: readonly Record<Recurso, number>[]): Estado {
  return conCambios(base, {
    jugadores: base.jugadores.map((j, i) =>
      Object.assign({}, j, { recursos: manos[i] ?? mano(0, 0, 0, 0, 0) }),
    ),
  });
}

describe('vistaPara', () => {
  const estado = conManos([mano(1, 2, 0, 0, 0), mano(0, 0, 3, 1, 0), mano(0, 0, 0, 0, 0)]);

  it('el jugador ve su mano y null en las ajenas, con totalCartas en todos', () => {
    const vista = vistaPara(estado, j1);
    expect(vista.yo).toBe(j1);
    expect(vista.jugadores.map((j) => j.recursos)).toEqual([null, mano(0, 0, 3, 1, 0), null, null]);
    expect(vista.jugadores.map((j) => j.totalCartas)).toEqual([3, 4, 0, 0]);
  });

  it('el espectador no ve ninguna mano pero sí los totales', () => {
    const vista = vistaPara(estado, null);
    expect(vista.yo).toBeNull();
    expect(vista.jugadores.every((j) => j.recursos === null)).toBe(true);
    expect(vista.jugadores.map((j) => j.totalCartas)).toEqual([3, 4, 0, 0]);
  });

  it('los puntos son públicos', () => {
    const conEdificios = conCambios(estado, {
      edificios: { [v1]: { dueno: j0, tipo: 'POBLADO' }, [v2]: { dueno: j0, tipo: 'CIUDAD' } },
    });
    expect(vistaPara(conEdificios, j1).jugadores.map((j) => j.puntos)).toEqual([3, 0, 0, 0]);
    expect(vistaPara(conEdificios, null).jugadores[0]?.puntos).toBe(3);
  });

  it('turnoDe es el id del jugador en turno, no el índice', () => {
    const vista = vistaPara(conCambios(estado, { turnoDe: 2 }), j0);
    expect(vista.turnoDe).toBe(j2);
  });

  it('turnoDe es null cuando la partida terminó (fase FIN)', () => {
    const fin = conCambios(estado, { fase: 'FIN', ganador: j1, turnoDe: 1 });
    const vista = vistaPara(fin, null);
    expect(vista.turnoDe).toBeNull();
    expect(vista.ganador).toBe(j1);
  });

  it('la config de la vista no expone la semillaAzar pero sí la semillaMapa', () => {
    for (const observador of [j0, null]) {
      const vista = vistaPara(estado, observador);
      expect('semillaAzar' in vista.config).toBe(false);
      expect(vista.config.semillaMapa).toBe(SEMILLA_MAPA);
      expect(JSON.stringify(vista)).not.toContain(SEMILLA_AZAR);
    }
  });

  it('un jugadorId vacío lanza el error (no es espectador)', () => {
    expect(() => vistaPara(estado, '')).toThrow('no participa en la partida');
  });

  it('un jugador inexistente lanza un error claro', () => {
    expect(() => vistaPara(estado, 'fantasma')).toThrow(
      'El jugador "fantasma" no participa en la partida',
    );
  });

  it('solo incluye las claves de Vista (y de VistaJugador)', () => {
    const vista = vistaPara(estado, j0);
    expect(Object.keys(vista).toSorted()).toEqual(
      [
        'banco',
        'caminos',
        'config',
        'dados',
        'descartesPendientes',
        'edificios',
        'fase',
        'ganador',
        'jugadores',
        'ladron',
        'turnoDe',
        'version',
        'yo',
      ].toSorted(),
    );
    // Lista literal a propósito: un campo nuevo de GameConfig (quizá sensible) hace fallar el test.
    expect(Object.keys(vista.config).toSorted()).toEqual(
      [
        'jugadores',
        'puntosVictoria',
        'radio',
        'robberHandLimit',
        'semillaMapa',
        'turnRuleMode',
      ].toSorted(),
    );
    expect(Object.keys(vista.jugadores[0] ?? {}).toSorted()).toEqual(
      ['id', 'piezasRestantes', 'puntos', 'recursos', 'totalCartas'].toSorted(),
    );
  });

  it('es serializable a JSON sin pérdida', () => {
    const conTodo = conCambios(estado, {
      edificios: { [v3]: { dueno: j0, tipo: 'POBLADO' } },
      caminos: { [e1]: j0 },
      dados: [3, 4],
    });
    const vista = vistaPara(conTodo, j0);
    expect(JSON.parse(JSON.stringify(vista))).toEqual(vista);
  });

  it('no comparte referencias mutables con el estado', () => {
    const conTodo = conCambios(estado, {
      edificios: { [v3]: { dueno: j0, tipo: 'POBLADO' } },
      caminos: { [e1]: j0 },
      dados: [3, 4],
    });
    const vista = vistaPara(conTodo, j0);
    expect(vista.config).not.toBe(conTodo.config);
    expect(vista.banco).not.toBe(conTodo.banco);
    expect(vista.edificios).not.toBe(conTodo.edificios);
    expect(vista.edificios[v3]).not.toBe(conTodo.edificios[v3]);
    expect(vista.caminos).not.toBe(conTodo.caminos);
    expect(vista.dados).not.toBe(conTodo.dados);
    expect(conTodo.ladron).not.toBeNull();
    expect(vista.ladron).not.toBe(conTodo.ladron);
    expect(vista.jugadores).not.toBe(conTodo.jugadores);
    expect(vista.jugadores[0]?.recursos).not.toBe(conTodo.jugadores[0]?.recursos);
    vista.jugadores.forEach((j, i) => {
      expect(j.piezasRestantes).not.toBe(conTodo.jugadores[i]?.piezasRestantes);
    });
  });

  it('no muta el estado recibido', () => {
    const antes = JSON.stringify(estado);
    vistaPara(estado, j0);
    expect(JSON.stringify(estado)).toBe(antes);
  });
});

describe('vistaPara: no filtra manos ajenas (propiedad)', () => {
  const cantidad = fc.integer({ min: 0, max: 19 });
  const manoAleatoria = fc
    .tuple(cantidad, cantidad, cantidad, cantidad, cantidad)
    .map(([m, l, o, t, n]) => mano(m, l, o, t, n));

  it('el JSON de la vista solo contiene la mano propia; el espectador, ninguna', () => {
    fc.assert(
      fc.property(fc.array(manoAleatoria, { minLength: 4, maxLength: 4 }), (manos) => {
        const partida = conManos(manos);
        const claveMano = '"recursos":{';
        for (const [i, observador] of partida.jugadores.entries()) {
          const vista = vistaPara(partida, observador.id);
          vista.jugadores.forEach((j, k) => {
            expect(j.recursos === null).toBe(k !== i);
          });
          expect(vista.jugadores[i]?.recursos).toEqual(manos[i]);
          expect(JSON.stringify(vista).split(claveMano).length - 1).toBe(1);
          expect(JSON.stringify(vista)).toContain(SEMILLA_MAPA);
          expect(JSON.stringify(vista)).not.toContain(SEMILLA_AZAR);
        }
        const espectador = vistaPara(partida, null);
        expect(espectador.jugadores.every((j) => j.recursos === null)).toBe(true);
        expect(JSON.stringify(espectador)).not.toContain(claveMano);
        expect(JSON.stringify(espectador)).toContain(SEMILLA_MAPA);
        expect(JSON.stringify(espectador)).not.toContain(SEMILLA_AZAR);
        espectador.jugadores.forEach((j, k) => {
          expect(j.totalCartas).toBe(RECURSOS.reduce((s, r) => s + (manos[k]?.[r] ?? 0), 0));
        });
      }),
    );
  });
});
