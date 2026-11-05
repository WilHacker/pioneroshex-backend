import { describe, expect, it } from 'vitest';
import { clave } from '../mapa/coordenadas.js';
import type { Recurso } from '../reglas/recursos.js';
import { crearPartida } from './crear.js';
import { decidir } from './decidir.js';
import { evolucionar } from './evolucionar.js';
import { conCambios, mesaDePrueba } from './pruebas.js';
import type { Accion, Estado, JugadorId } from './tipos.js';

const mesa = mesaDePrueba();
const partida = crearPartida(mesa, ['a', 'b', 'c', 'd']);
const [j0, j1, j2] = partida.jugadores.map((j) => j.id) as [JugadorId, JugadorId, JugadorId];

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

describe('MOVER_LADRON: decidirLadrón', () => {
  const casillaInicial = mesa.tablero.casillas[0]!.hex;
  const casillaDestino = mesa.tablero.casillas[1]!.hex;
  const casillaSinEdificios = mesa.tablero.casillas[2]!.hex;

  // Vértices de casillaDestino
  const verticeDestino = mesa.mapa.vertices.find((v) =>
    v.casillas.some((c) => clave(c) === clave(casillaDestino)),
  )!;
  const v1 = verticeDestino.id;

  const estadoMover: Estado = conCambios(partida, {
    fase: 'MOVER_LADRON',
    ladron: casillaInicial,
    turnoDe: 0,
    edificios: {
      [v1]: { dueno: j1, tipo: 'POBLADO' },
    },
  });

  it('rechaza si no es la fase MOVER_LADRON', () => {
    const estado = conCambios(estadoMover, { fase: 'FASE_PRINCIPAL' });
    const accion: Accion = {
      tipo: 'MOVER_LADRON',
      jugador: j0,
      destino: casillaDestino,
      victima: j1,
    };
    expect(decidir(mesa, estado, accion)).toEqual({
      ok: false,
      motivo: 'FASE_INCORRECTA',
    });
  });

  it('rechaza si el destino no es una casilla del mapa', () => {
    const accion: Accion = {
      tipo: 'MOVER_LADRON',
      jugador: j0,
      destino: { q: 99, r: 99, s: -198 },
      victima: null,
    };
    expect(decidir(mesa, estadoMover, accion)).toEqual({
      ok: false,
      motivo: 'DESTINO_INVALIDO',
    });
  });

  it('rechaza si el destino es la misma casilla donde ya está el ladrón', () => {
    const accion: Accion = {
      tipo: 'MOVER_LADRON',
      jugador: j0,
      destino: casillaInicial,
      victima: null,
    };
    expect(decidir(mesa, estadoMover, accion)).toEqual({
      ok: false,
      motivo: 'MISMO_DESTINO',
    });
  });

  it('rechaza victima null si hay rivales con cartas en la casilla destino', () => {
    const conCartas = conRecursos(estadoMover, j1, { TRIGO: 2 });
    const accion: Accion = {
      tipo: 'MOVER_LADRON',
      jugador: j0,
      destino: casillaDestino,
      victima: null,
    };
    expect(decidir(mesa, conCartas, accion)).toEqual({
      ok: false,
      motivo: 'VICTIMA_REQUERIDA',
    });
  });

  it('rechaza victima si no tiene edificios en la casilla destino', () => {
    // j1 tiene edificio y cartas, j2 tiene cartas pero no edificio en casillaDestino
    const conCartas = conRecursos(conRecursos(estadoMover, j1, { TRIGO: 2 }), j2, { TRIGO: 2 });
    const accion: Accion = {
      tipo: 'MOVER_LADRON',
      jugador: j0,
      destino: casillaDestino,
      victima: j2,
    };
    expect(decidir(mesa, conCartas, accion)).toEqual({
      ok: false,
      motivo: 'VICTIMA_INVALIDA',
    });
  });

  it('rechaza victima con SIN_VICTIMA_POSIBLE si tiene edificio pero ningún rival tiene cartas', () => {
    // j1 tiene edificio en v1 pero 0 cartas
    const conCartas = conRecursos(estadoMover, j1, { TRIGO: 0 });
    const accion: Accion = {
      tipo: 'MOVER_LADRON',
      jugador: j0,
      destino: casillaDestino,
      victima: j1,
    };
    expect(decidir(mesa, conCartas, accion)).toEqual({
      ok: false,
      motivo: 'SIN_VICTIMA_POSIBLE',
    });
  });

  it('si no hay rivales con cartas, victima debe ser null y pasa a FASE_PRINCIPAL sin robo', () => {
    const accion: Accion = {
      tipo: 'MOVER_LADRON',
      jugador: j0,
      destino: casillaSinEdificios,
      victima: null,
    };
    const res = decidir(mesa, estadoMover, accion);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.eventos).toEqual([
      {
        tipo: 'LADRON_MOVIDO',
        jugador: j0,
        causa: 'VOLUNTARIA',
        destino: casillaSinEdificios,
      },
      {
        tipo: 'FASE_CAMBIADA',
        fase: 'FASE_PRINCIPAL',
        turnoDe: estadoMover.turnoDe,
        pasoPreparacion: estadoMover.pasoPreparacion,
      },
    ]);
  });

  it('si hay víctima válida con cartas, roba 1 carta al azar y pasa a FASE_PRINCIPAL', () => {
    const conCartas = conRecursos(estadoMover, j1, { MADERA: 3 });
    const accion: Accion = {
      tipo: 'MOVER_LADRON',
      jugador: j0,
      destino: casillaDestino,
      victima: j1,
    };
    const res = decidir(mesa, conCartas, accion);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.eventos[0]).toEqual({
      tipo: 'LADRON_MOVIDO',
      jugador: j0,
      causa: 'VOLUNTARIA',
      destino: casillaDestino,
    });
    expect(res.eventos[1]).toEqual({
      tipo: 'CARTA_ROBADA',
      ladron: j0,
      victima: j1,
      recurso: 'MADERA',
    });
    expect(res.eventos[2]).toEqual({
      tipo: 'FASE_CAMBIADA',
      fase: 'FASE_PRINCIPAL',
      turnoDe: estadoMover.turnoDe,
      pasoPreparacion: estadoMover.pasoPreparacion,
    });
  });
});

describe('MOVER_LADRON: evolucionar y aplicar', () => {
  it('evolucionar mueve el ladron y transfiere la carta robada', () => {
    const estado = conRecursos(partida, j1, { TRIGO: 2 });
    const casillaDestino = mesa.tablero.casillas[1]!.hex;

    const e1 = evolucionar(estado, {
      tipo: 'LADRON_MOVIDO',
      jugador: j0,
      causa: 'VOLUNTARIA',
      destino: casillaDestino,
    });
    expect(e1.ladron).toEqual(casillaDestino);

    const e2 = evolucionar(e1, {
      tipo: 'CARTA_ROBADA',
      ladron: j0,
      victima: j1,
      recurso: 'TRIGO',
    });
    const j0Actualizado = e2.jugadores.find((j) => j.id === j0)!;
    const j1Actualizado = e2.jugadores.find((j) => j.id === j1)!;
    expect(j0Actualizado.recursos.TRIGO).toBe(1);
    expect(j1Actualizado.recursos.TRIGO).toBe(1);
  });
});
