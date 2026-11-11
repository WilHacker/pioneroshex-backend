import { describe, expect, it } from 'vitest';
import { RECURSOS, type Recurso } from '../reglas/recursos.js';
import { aplicar } from './aplicar.js';
import { crearPartida } from './crear.js';
import { decidir } from './decidir.js';
import { evolucionar } from './evolucionar.js';
import { conCambios, mesaDePrueba } from './pruebas.js';
import type { Accion, Estado, Evento, JugadorId } from './tipos.js';

const mesa = mesaDePrueba();
const partida = crearPartida(mesa, ['a', 'b', 'c', 'd']);
const [j0] = partida.jugadores.map((j) => j.id) as [JugadorId];

type Mano = Partial<Record<Recurso, number>>;

const conRecursos = (estado: Estado, jugadorId: JugadorId, recursos: Mano): Estado =>
  conCambios(estado, {
    jugadores: estado.jugadores.map((j) =>
      j.id === jugadorId ? { ...j, recursos: { ...j.recursos, ...recursos } } : j,
    ),
  });

const enFasePrincipal = (estado: Estado = partida): Estado =>
  conCambios(estado, {
    fase: 'FASE_PRINCIPAL',
    pasoPreparacion: 8,
    turnoDe: 0,
  });

const cambio = (entrega: Mano, recibe: Mano): Accion => ({
  tipo: 'CAMBIAR_CON_BANCA',
  jugador: j0,
  entrega,
  recibe,
});

/** Lo que pagó y lo que recibió el jugador en conjunto, sea cual sea el emparejamiento de los eventos. */
function neto(eventos: readonly Evento[]): { entrega: Mano; recibe: Mano; cambios: number } {
  const entrega: Mano = {};
  const recibe: Mano = {};
  let cambios = 0;
  for (const e of eventos) {
    if (e.tipo !== 'CAMBIO_CON_BANCA_REALIZADO') continue;
    cambios += 1;
    entrega[e.entrega] = (entrega[e.entrega] ?? 0) + e.cantidadEntregada;
    recibe[e.recibe] = (recibe[e.recibe] ?? 0) + e.cantidadRecibida;
  }
  return { entrega, recibe, cambios };
}

const eventosDe = (estado: Estado, accion: Accion): readonly Evento[] => {
  const r = decidir(mesa, estado, accion);
  if (!r.ok) throw new Error(`Se esperaba aceptar y se rechazó: ${r.motivo}`);
  return r.eventos;
};

const conPuerto = (tipo: 'GENERICO' | Recurso): Estado => {
  const puerto = mesa.puertos.find((p) => p.tipo === tipo)!;
  return conCambios(enFasePrincipal(), {
    edificios: { [puerto.vertices[0]]: { dueno: j0, tipo: 'POBLADO' } },
  });
};

describe('CAMBIAR_CON_BANCA: un cambio simple', () => {
  it('fase incorrecta si no es FASE_PRINCIPAL', () => {
    const estado = conCambios(partida, { fase: 'PRE_TIRADA' });
    expect(decidir(mesa, estado, cambio({ MADERA: 4 }, { TRIGO: 1 }))).toEqual({
      ok: false,
      motivo: 'FASE_INCORRECTA',
    });
  });

  it('rechaza si entrega y recibe son el mismo recurso', () => {
    const estado = conRecursos(enFasePrincipal(), j0, { MADERA: 5 });
    expect(decidir(mesa, estado, cambio({ MADERA: 4 }, { MADERA: 1 }))).toEqual({
      ok: false,
      motivo: 'MISMO_RECURSO',
    });
  });

  it('sin puertos, exige ratio 4:1 y rechaza con RECURSOS_INSUFICIENTES si faltan', () => {
    const estado = conRecursos(enFasePrincipal(), j0, { MADERA: 3 });
    expect(decidir(mesa, estado, cambio({ MADERA: 4 }, { TRIGO: 1 }))).toEqual({
      ok: false,
      motivo: 'RECURSOS_INSUFICIENTES',
      falta: { MADERA: 1 },
    });
  });

  it('sin puertos, acepta cambio 4:1 si tiene 4 o más recursos', () => {
    const estado = conRecursos(enFasePrincipal(), j0, { MADERA: 4 });
    expect(decidir(mesa, estado, cambio({ MADERA: 4 }, { TRIGO: 1 }))).toEqual({
      ok: true,
      eventos: [
        {
          tipo: 'CAMBIO_CON_BANCA_REALIZADO',
          jugador: j0,
          entrega: 'MADERA',
          cantidadEntregada: 4,
          recibe: 'TRIGO',
          cantidadRecibida: 1,
        },
      ],
    });
  });

  it('con puerto genérico 3:1, acepta con 3 recursos y rechaza con 2', () => {
    const estadoConPuerto = conPuerto('GENERICO');
    const accion = cambio({ OVEJA: 3 }, { MINERAL: 1 });

    expect(decidir(mesa, conRecursos(estadoConPuerto, j0, { OVEJA: 2 }), accion)).toEqual({
      ok: false,
      motivo: 'RECURSOS_INSUFICIENTES',
      falta: { OVEJA: 1 },
    });
    expect(decidir(mesa, conRecursos(estadoConPuerto, j0, { OVEJA: 3 }), accion)).toEqual({
      ok: true,
      eventos: [
        {
          tipo: 'CAMBIO_CON_BANCA_REALIZADO',
          jugador: j0,
          entrega: 'OVEJA',
          cantidadEntregada: 3,
          recibe: 'MINERAL',
          cantidadRecibida: 1,
        },
      ],
    });
  });

  it('con puerto específico 2:1, acepta con 2 del tipo de puerto; los demás siguen a 4:1', () => {
    const estado = conRecursos(conPuerto('MINERAL'), j0, { MINERAL: 2, MADERA: 2 });
    expect(decidir(mesa, estado, cambio({ MINERAL: 2 }, { TRIGO: 1 }))).toEqual({
      ok: true,
      eventos: [
        {
          tipo: 'CAMBIO_CON_BANCA_REALIZADO',
          jugador: j0,
          entrega: 'MINERAL',
          cantidadEntregada: 2,
          recibe: 'TRIGO',
          cantidadRecibida: 1,
        },
      ],
    });
    // Para MADERA no hay puerto de madera ni genérico: sigue pidiendo 4.
    expect(decidir(mesa, estado, cambio({ MADERA: 4 }, { TRIGO: 1 }))).toEqual({
      ok: false,
      motivo: 'RECURSOS_INSUFICIENTES',
      falta: { MADERA: 2 },
    });
  });

  it('rechaza si el banco está agotado del recurso pedido', () => {
    const estado = conCambios(conRecursos(enFasePrincipal(), j0, { MADERA: 4 }), {
      banco: { ...partida.banco, TRIGO: 0 },
    });
    expect(decidir(mesa, estado, cambio({ MADERA: 4 }, { TRIGO: 1 }))).toEqual({
      ok: false,
      motivo: 'BANCO_AGOTADO',
      detalle: { recurso: 'TRIGO', pedido: 1, disponible: 0 },
    });
  });
});

describe('CAMBIAR_CON_BANCA: varios recursos a la vez', () => {
  const rica = (): Estado =>
    conRecursos(enFasePrincipal(), j0, { MADERA: 8, TRIGO: 4, LADRILLO: 0, OVEJA: 0, MINERAL: 0 });

  it('4 de madera + 4 de trigo por 2 de oveja: son 2 cambios y recibo 2 cartas', () => {
    const eventos = eventosDe(rica(), cambio({ MADERA: 4, TRIGO: 4 }, { OVEJA: 2 }));
    expect(neto(eventos)).toEqual({
      entrega: { MADERA: 4, TRIGO: 4 },
      recibe: { OVEJA: 2 },
      cambios: 2,
    });
  });

  it('8 de madera + 4 de trigo por 2 de oveja + 1 de ladrillo: 3 cambios, 3 cartas', () => {
    const eventos = eventosDe(rica(), cambio({ MADERA: 8, TRIGO: 4 }, { OVEJA: 2, LADRILLO: 1 }));
    expect(neto(eventos)).toEqual({
      entrega: { MADERA: 8, TRIGO: 4 },
      recibe: { OVEJA: 2, LADRILLO: 1 },
      cambios: 3,
    });
  });

  it('cada cambio entrega una razón completa y recibe una carta', () => {
    const eventos = eventosDe(rica(), cambio({ MADERA: 8, TRIGO: 4 }, { OVEJA: 2, LADRILLO: 1 }));
    for (const e of eventos) {
      expect(e).toMatchObject({
        tipo: 'CAMBIO_CON_BANCA_REALIZADO',
        jugador: j0,
        cantidadRecibida: 1,
      });
      expect(e.tipo === 'CAMBIO_CON_BANCA_REALIZADO' && e.cantidadEntregada).toBe(4);
    }
  });

  it('con un puerto genérico (3:1) cada recurso se paga a 3', () => {
    const estado = conRecursos(conPuerto('GENERICO'), j0, { OVEJA: 3, MADERA: 3 });
    const eventos = eventosDe(estado, cambio({ OVEJA: 3, MADERA: 3 }, { MINERAL: 2 }));
    expect(neto(eventos)).toEqual({
      entrega: { MADERA: 3, OVEJA: 3 },
      recibe: { MINERAL: 2 },
      cambios: 2,
    });
  });

  it('cada recurso usa su propia razón: mineral a 2:1 por el puerto y madera a 4:1', () => {
    const estado = conRecursos(conPuerto('MINERAL'), j0, { MINERAL: 2, MADERA: 4 });
    const eventos = eventosDe(estado, cambio({ MINERAL: 2, MADERA: 4 }, { TRIGO: 2 }));
    expect(neto(eventos)).toEqual({
      entrega: { MINERAL: 2, MADERA: 4 },
      recibe: { TRIGO: 2 },
      cambios: 2,
    });
  });

  it('se pueden pedir cartas de varios tipos: una de cada una', () => {
    const eventos = eventosDe(rica(), cambio({ MADERA: 8 }, { OVEJA: 1, LADRILLO: 1 }));
    expect(neto(eventos).recibe).toEqual({ OVEJA: 1, LADRILLO: 1 });
  });

  it('no deja pedir menos cartas que cambios (8 de madera por 1 de oveja)', () => {
    expect(decidir(mesa, rica(), cambio({ MADERA: 8 }, { OVEJA: 1 }))).toEqual({
      ok: false,
      motivo: 'CAMBIO_INCORRECTO',
      detalle: { requerido: 2, pedidas: 1 },
    });
  });

  it('ni más cartas que cambios (4 de madera por 2 de oveja)', () => {
    expect(decidir(mesa, rica(), cambio({ MADERA: 4 }, { OVEJA: 2 }))).toEqual({
      ok: false,
      motivo: 'CAMBIO_INCORRECTO',
      detalle: { requerido: 1, pedidas: 2 },
    });
  });

  it('cada recurso entregado debe ser múltiplo de su razón (6 de madera a 4:1 no vale)', () => {
    expect(decidir(mesa, rica(), cambio({ MADERA: 6 }, { OVEJA: 1 }))).toMatchObject({
      ok: false,
      motivo: 'CAMBIO_INCORRECTO',
    });
  });

  it('con puerto de mineral, 3 de mineral no son múltiplo de 2', () => {
    const estado = conRecursos(conPuerto('MINERAL'), j0, { MINERAL: 3 });
    expect(decidir(mesa, estado, cambio({ MINERAL: 3 }, { TRIGO: 1 }))).toMatchObject({
      ok: false,
      motivo: 'CAMBIO_INCORRECTO',
    });
  });

  it('no se puede pedir un recurso que también se entrega', () => {
    expect(decidir(mesa, rica(), cambio({ MADERA: 4, TRIGO: 4 }, { TRIGO: 1, OVEJA: 1 }))).toEqual({
      ok: false,
      motivo: 'MISMO_RECURSO',
    });
  });

  it('sin entregar nada o sin pedir nada, la oferta está vacía', () => {
    expect(decidir(mesa, rica(), cambio({}, { OVEJA: 1 }))).toEqual({
      ok: false,
      motivo: 'OFERTA_VACIA',
    });
    expect(decidir(mesa, rica(), cambio({ MADERA: 4 }, {}))).toEqual({
      ok: false,
      motivo: 'PETICION_VACIA',
    });
    expect(decidir(mesa, rica(), cambio({ MADERA: 0 }, { OVEJA: 0 }))).toEqual({
      ok: false,
      motivo: 'OFERTA_VACIA',
    });
  });

  it.each([
    ['un recurso que no existe', { ORO: 4 }],
    ['una cantidad negativa', { MADERA: -4 }],
    ['una cantidad con decimales', { MADERA: 4.5 }],
  ])('rechaza %s', (_nombre, entrega) => {
    expect(decidir(mesa, rica(), cambio(entrega as Mano, { OVEJA: 1 }))).toEqual({
      ok: false,
      motivo: 'RECURSO_INVALIDO',
    });
  });

  it('si faltan recursos en varios tipos, dice cuánto falta de cada uno', () => {
    const estado = conRecursos(enFasePrincipal(), j0, { MADERA: 3, TRIGO: 1 });
    expect(decidir(mesa, estado, cambio({ MADERA: 4, TRIGO: 4 }, { OVEJA: 2 }))).toEqual({
      ok: false,
      motivo: 'RECURSOS_INSUFICIENTES',
      falta: { MADERA: 1, TRIGO: 3 },
    });
  });

  it('si el banco no tiene todas las cartas pedidas, dice cuántas faltan', () => {
    const estado = conCambios(rica(), { banco: { ...partida.banco, OVEJA: 1 } });
    expect(decidir(mesa, estado, cambio({ MADERA: 4, TRIGO: 4 }, { OVEJA: 2 }))).toEqual({
      ok: false,
      motivo: 'BANCO_AGOTADO',
      detalle: { recurso: 'OVEJA', pedido: 2, disponible: 1 },
    });
  });

  it('cada recurso que se pide cuenta por separado contra el banco', () => {
    const estado = conCambios(rica(), { banco: { ...partida.banco, LADRILLO: 0 } });
    expect(decidir(mesa, estado, cambio({ MADERA: 8 }, { OVEJA: 1, LADRILLO: 1 }))).toEqual({
      ok: false,
      motivo: 'BANCO_AGOTADO',
      detalle: { recurso: 'LADRILLO', pedido: 1, disponible: 0 },
    });
  });
});

describe('CAMBIAR_CON_BANCA: evolucionar y aplicar', () => {
  it('evolucionar descuenta del jugador y suma al banco, y viceversa', () => {
    const estado = conRecursos(enFasePrincipal(), j0, { MADERA: 5, TRIGO: 1 });
    const maderaInicialBanco = estado.banco.MADERA;
    const trigoInicialBanco = estado.banco.TRIGO;

    const siguiente = evolucionar(estado, {
      tipo: 'CAMBIO_CON_BANCA_REALIZADO',
      jugador: j0,
      entrega: 'MADERA',
      cantidadEntregada: 4,
      recibe: 'TRIGO',
      cantidadRecibida: 1,
    });

    const jActualizado = siguiente.jugadores.find((j) => j.id === j0)!;
    expect(jActualizado.recursos.MADERA).toBe(1);
    expect(jActualizado.recursos.TRIGO).toBe(2);
    expect(siguiente.banco.MADERA).toBe(maderaInicialBanco + 4);
    expect(siguiente.banco.TRIGO).toBe(trigoInicialBanco - 1);
    expect(siguiente.version).toBe(estado.version + 1);
  });

  it('aplicar integra decidir y evolucionar de punta a punta', () => {
    const estado = conRecursos(enFasePrincipal(), j0, { MADERA: 4, TRIGO: 0 });
    const res = aplicar(mesa, estado, cambio({ MADERA: 4 }, { TRIGO: 1 }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.estado.jugadores[0]?.recursos.MADERA).toBe(0);
    expect(res.estado.jugadores[0]?.recursos.TRIGO).toBe(1);
  });

  it('un cambio con varios recursos deja la mano y el banco justo como toca', () => {
    const estado = conRecursos(enFasePrincipal(), j0, {
      MADERA: 8,
      TRIGO: 4,
      LADRILLO: 0,
      OVEJA: 0,
    });
    const res = aplicar(mesa, estado, cambio({ MADERA: 8, TRIGO: 4 }, { OVEJA: 2, LADRILLO: 1 }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const mano = res.estado.jugadores[0]!.recursos;
    expect(mano).toMatchObject({ MADERA: 0, TRIGO: 0, OVEJA: 2, LADRILLO: 1 });
    for (const [recurso, delta] of [
      ['MADERA', 8],
      ['TRIGO', 4],
      ['OVEJA', -2],
      ['LADRILLO', -1],
    ] as const) {
      expect(res.estado.banco[recurso]).toBe(estado.banco[recurso] + delta);
    }
    // Ni se crean ni se pierden cartas: lo que sale de la mano entra al banco y al revés.
    const total = (e: Estado): number =>
      RECURSOS.reduce(
        (suma, r) => suma + e.banco[r] + e.jugadores.reduce((s, j) => s + j.recursos[r], 0),
        0,
      );
    expect(total(res.estado)).toBe(total(estado));
  });
});
