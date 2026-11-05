import { describe, expect, it } from 'vitest';
import type { Recurso } from '../reglas/recursos.js';
import { aplicar } from './aplicar.js';
import { crearPartida } from './crear.js';
import { decidir } from './decidir.js';
import { evolucionar } from './evolucionar.js';
import { conCambios, mesaDePrueba } from './pruebas.js';
import type { Accion, Estado, JugadorId } from './tipos.js';

const mesa = mesaDePrueba();
const partida = crearPartida(mesa, ['a', 'b', 'c', 'd']);
const [j0] = partida.jugadores.map((j) => j.id) as [JugadorId];

const conRecursos = (
  estado: Estado,
  jugadorId: JugadorId,
  recursos: Partial<Record<Recurso, number>>,
): Estado =>
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

describe('CAMBIAR_CON_BANCA: decidirCambioConBanca', () => {
  it('fase incorrecta si no es FASE_PRINCIPAL', () => {
    const estado = conCambios(partida, { fase: 'PRE_TIRADA' });
    const accion: Accion = {
      tipo: 'CAMBIAR_CON_BANCA',
      jugador: j0,
      entrega: 'MADERA',
      recibe: 'TRIGO',
    };
    expect(decidir(mesa, estado, accion)).toEqual({
      ok: false,
      motivo: 'FASE_INCORRECTA',
    });
  });

  it('rechaza si entrega y recibe son el mismo recurso', () => {
    const estado = conRecursos(enFasePrincipal(), j0, { MADERA: 5 });
    const accion: Accion = {
      tipo: 'CAMBIAR_CON_BANCA',
      jugador: j0,
      entrega: 'MADERA',
      recibe: 'MADERA',
    };
    expect(decidir(mesa, estado, accion)).toEqual({
      ok: false,
      motivo: 'MISMO_RECURSO',
    });
  });

  it('sin puertos, exige ratio 4:1 y rechaza con RECURSOS_INSUFICIENTES si faltan', () => {
    const estado = conRecursos(enFasePrincipal(), j0, { MADERA: 3 });
    const accion: Accion = {
      tipo: 'CAMBIAR_CON_BANCA',
      jugador: j0,
      entrega: 'MADERA',
      recibe: 'TRIGO',
    };
    expect(decidir(mesa, estado, accion)).toEqual({
      ok: false,
      motivo: 'RECURSOS_INSUFICIENTES',
      falta: { MADERA: 1 },
    });
  });

  it('sin puertos, acepta cambio 4:1 si tiene 4 o más recursos', () => {
    const estado = conRecursos(enFasePrincipal(), j0, { MADERA: 4 });
    const accion: Accion = {
      tipo: 'CAMBIAR_CON_BANCA',
      jugador: j0,
      entrega: 'MADERA',
      recibe: 'TRIGO',
    };
    expect(decidir(mesa, estado, accion)).toEqual({
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
    const puertoGenerico = mesa.puertos.find((p) => p.tipo === 'GENERICO')!;
    const verticePuerto = puertoGenerico.vertices[0];
    const estadoConPuerto = conCambios(enFasePrincipal(), {
      edificios: { [verticePuerto]: { dueno: j0, tipo: 'POBLADO' } },
    });

    const estadoCon2 = conRecursos(estadoConPuerto, j0, { OVEJA: 2 });
    const accion: Accion = {
      tipo: 'CAMBIAR_CON_BANCA',
      jugador: j0,
      entrega: 'OVEJA',
      recibe: 'MINERAL',
    };
    expect(decidir(mesa, estadoCon2, accion)).toEqual({
      ok: false,
      motivo: 'RECURSOS_INSUFICIENTES',
      falta: { OVEJA: 1 },
    });

    const estadoCon3 = conRecursos(estadoConPuerto, j0, { OVEJA: 3 });
    expect(decidir(mesa, estadoCon3, accion)).toEqual({
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

  it('con puerto específico 2:1, acepta con 2 recursos del tipo de puerto', () => {
    const puertoMineral = mesa.puertos.find((p) => p.tipo === 'MINERAL')!;
    const verticePuerto = puertoMineral.vertices[0];
    const estadoConPuerto = conCambios(enFasePrincipal(), {
      edificios: { [verticePuerto]: { dueno: j0, tipo: 'POBLADO' } },
    });

    const estadoCon2 = conRecursos(estadoConPuerto, j0, { MINERAL: 2, MADERA: 2 });
    const accionMineral: Accion = {
      tipo: 'CAMBIAR_CON_BANCA',
      jugador: j0,
      entrega: 'MINERAL',
      recibe: 'TRIGO',
    };
    expect(decidir(mesa, estadoCon2, accionMineral)).toEqual({
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

    // Para MADERA, como no tiene puerto de madera ni genérico, sigue requiriendo 4:1
    const accionMadera: Accion = {
      tipo: 'CAMBIAR_CON_BANCA',
      jugador: j0,
      entrega: 'MADERA',
      recibe: 'TRIGO',
    };
    expect(decidir(mesa, estadoCon2, accionMadera)).toEqual({
      ok: false,
      motivo: 'RECURSOS_INSUFICIENTES',
      falta: { MADERA: 2 },
    });
  });

  it('rechaza si el banco está agotado del recurso pedido', () => {
    const estado = conCambios(conRecursos(enFasePrincipal(), j0, { MADERA: 4 }), {
      banco: { ...partida.banco, TRIGO: 0 },
    });
    const accion: Accion = {
      tipo: 'CAMBIAR_CON_BANCA',
      jugador: j0,
      entrega: 'MADERA',
      recibe: 'TRIGO',
    };
    expect(decidir(mesa, estado, accion)).toEqual({
      ok: false,
      motivo: 'BANCO_AGOTADO',
      detalle: { recurso: 'TRIGO', pedido: 1, disponible: 0 },
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
    const accion: Accion = {
      tipo: 'CAMBIAR_CON_BANCA',
      jugador: j0,
      entrega: 'MADERA',
      recibe: 'TRIGO',
    };
    const res = aplicar(mesa, estado, accion);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.estado.jugadores[0]?.recursos.MADERA).toBe(0);
    expect(res.estado.jugadores[0]?.recursos.TRIGO).toBe(1);
  });
});
