import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { accionesDisponibles, enumerarAcciones } from './acciones.js';
import { crearPartida } from './crear.js';
import { explicarAccion } from './explicar.js';
import { conCambios, mesaDePrueba } from './pruebas.js';
import type { Accion, Estado } from './tipos.js';

const mesa = mesaDePrueba();
const base = crearPartida(mesa, ['a', 'b', 'c', 'd']);
const yo = base.jugadores[0]!.id;
const rival = base.jugadores[1]!.id;

const vertice = mesa.mapa.vertices.find((v) => v.vecinos.length === 3)!;
const vecino = vertice.vecinos[0]!;

const MANO_LLENA = { MADERA: 9, LADRILLO: 9, OVEJA: 9, TRIGO: 9, MINERAL: 9 };
const MANO_VACIA = { MADERA: 0, LADRILLO: 0, OVEJA: 0, TRIGO: 0, MINERAL: 0 };

/** Misma partida con todos los jugadores con la mano `recursos`. */
const conManos = (estado: Estado, recursos: Estado['jugadores'][number]['recursos']): Estado =>
  produce(estado, (e) => {
    for (const j of e.jugadores) j.recursos = { ...recursos };
  });

/** Mi turno, con mano abundante y un poblado rival en `vertice`. */
const conRival: Estado = conManos(
  conCambios(base, {
    fase: 'FASE_PRINCIPAL',
    turnoDe: 0,
    pasoPreparacion: 2 * base.jugadores.length,
    edificios: { [vertice.id]: { dueno: rival, tipo: 'POBLADO' } },
  }),
  MANO_LLENA,
);

const pobladoEn = (v: string): Accion => ({ tipo: 'CONSTRUIR_POBLADO', jugador: yo, vertice: v });

describe('explicarAccion', () => {
  it('dice ok para una acción legal', () => {
    expect(explicarAccion(mesa, conRival, { tipo: 'TERMINAR_TURNO', jugador: yo })).toEqual({
      ok: true,
    });
  });

  it('explica por qué un lugar concreto no sirve, con datos', () => {
    expect(explicarAccion(mesa, conRival, pobladoEn(vecino))).toEqual({
      ok: false,
      motivo: 'DEMASIADO_CERCA',
      detalle: { vecinoOcupado: vertice.id, dueno: rival },
    });
  });

  it('explica lo que falta cuando no alcanzan los recursos', () => {
    const pobre = conManos(conRival, MANO_VACIA);
    const lejos = mesa.mapa.vertices.find(
      (v) => v.id !== vertice.id && !v.vecinos.includes(vertice.id),
    )!;
    const r = explicarAccion(mesa, pobre, pobladoEn(lejos.id));
    expect(r).toMatchObject({ ok: false, motivo: 'RECURSOS_INSUFICIENTES' });
    if (r.ok) return;
    expect(Object.keys(r.falta ?? {}).length).toBeGreaterThan(0);
  });

  it('un jugador que no participa devuelve motivo, no lanza', () => {
    expect(explicarAccion(mesa, conRival, { tipo: 'TERMINAR_TURNO', jugador: 'fantasma' })).toEqual(
      { ok: false, motivo: 'JUGADOR_DESCONOCIDO' },
    );
  });

  it('un tipo de acción desconocido devuelve motivo, no lanza', () => {
    const rara = { tipo: 'VOLAR', jugador: yo } as unknown as Accion;
    expect(explicarAccion(mesa, conRival, rara)).toMatchObject({
      ok: false,
      motivo: 'FASE_INCORRECTA',
    });
  });

  it('con la partida terminada dice PARTIDA_TERMINADA', () => {
    const fin = conCambios(conRival, { fase: 'FIN', ganador: yo });
    expect(explicarAccion(mesa, fin, { tipo: 'TERMINAR_TURNO', jugador: yo })).toEqual({
      ok: false,
      motivo: 'PARTIDA_TERMINADA',
    });
  });

  it('no muta el estado', () => {
    const copia = structuredClone(conRival);
    explicarAccion(mesa, conRival, pobladoEn(vecino));
    expect(conRival).toEqual(copia);
  });

  it('acepta toda acción que enumerarAcciones ofrece y rechaza lo que accionesDisponibles niega', () => {
    for (const accion of enumerarAcciones(mesa, conRival, yo)) {
      expect(explicarAccion(mesa, conRival, accion)).toEqual({ ok: true });
    }
    const negadas = accionesDisponibles(mesa, conRival, yo).filter((a) => !a.disponible);
    expect(negadas.length).toBeGreaterThan(0);
    expect(enumerarAcciones(mesa, conRival, yo).map((a) => a.tipo)).not.toContain(negadas[0]!.tipo);
  });
});
