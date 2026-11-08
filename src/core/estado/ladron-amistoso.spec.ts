import { describe, expect, it } from 'vitest';
import { crearGameConfig, PUNTOS_LADRON_AMISTOSO } from '../partida/game-config.js';
import { clave } from '../mapa/coordenadas.js';
import { crearPartida } from './crear.js';
import { decidir } from './decidir.js';
import { conCambios, mesaDePrueba } from './pruebas.js';
import type { Edificio, Estado, JugadorId } from './tipos.js';
import { victimasPosibles } from './victimas.js';

const ids = ['a', 'b', 'c', 'd'];

function escenario(ladronAmistoso: boolean) {
  const mesa = mesaDePrueba({ jugadores: 4, ladronAmistoso });
  const inicial = crearPartida(mesa, ids);
  const [yo, rival, otro] = inicial.jugadores.map((j) => j.id) as [JugadorId, JugadorId, JugadorId];
  const destino = mesa.tablero.casillas[1]!.hex;
  const verticesDeLaCasilla = mesa.mapa.vertices.filter((v) =>
    v.casillas.some((c) => clave(c) === clave(destino)),
  );
  const lejanos = mesa.mapa.vertices.filter((v) => !verticesDeLaCasilla.includes(v));
  const [enCasilla, enCasilla2] = verticesDeLaCasilla.map((v) => v.id) as [string, string];

  /** `rival` tiene un poblado en la casilla y `extra` poblados más lejos: `1 + extra` puntos. */
  function conRival(extra: number, cambios: Partial<Estado> = {}): Estado {
    const edificios: Record<string, Edificio> = { [enCasilla]: { dueno: rival, tipo: 'POBLADO' } };
    for (let i = 0; i < extra; i++)
      edificios[lejanos[i * 5]!.id] = { dueno: rival, tipo: 'POBLADO' };
    return conCambios(inicial, {
      fase: 'MOVER_LADRON',
      pasoPreparacion: 8,
      turnoDe: 0,
      ladron: mesa.tablero.casillas[0]!.hex,
      edificios,
      jugadores: inicial.jugadores.map((j) =>
        j.id === rival || j.id === otro ? { ...j, recursos: { ...j.recursos, MADERA: 2 } } : j,
      ),
      ...cambios,
    });
  }
  const mover = (estado: Estado, victima: JugadorId | null) =>
    decidir(mesa, estado, { tipo: 'MOVER_LADRON', jugador: yo, destino, victima });

  return {
    mesa,
    inicial,
    yo,
    rival,
    otro,
    destino,
    enCasilla,
    enCasilla2,
    lejanos,
    conRival,
    mover,
  };
}

describe('GameConfig.ladronAmistoso', () => {
  it('por defecto está desactivado y el umbral son 3 puntos', () => {
    expect(mesaDePrueba().config.ladronAmistoso).toBe(false);
    expect(PUNTOS_LADRON_AMISTOSO).toBe(3);
  });

  it('se puede activar y solo admite verdadero o falso', () => {
    expect(mesaDePrueba({ ladronAmistoso: true }).config.ladronAmistoso).toBe(true);
    expect(() =>
      crearGameConfig({
        semillaMapa: 'm',
        semillaAzar: 'azar-secreto',
        ladronAmistoso: 'si' as never,
      }),
    ).toThrow(/ladronAmistoso/);
  });
});

describe('Ladrón amistoso: a quién se puede robar', () => {
  it('sin la regla se puede robar a quien tiene un solo punto', () => {
    const e = escenario(false);
    const estado = e.conRival(0);
    expect(victimasPosibles(e.mesa, estado, e.yo, e.destino)).toEqual([e.rival]);
  });

  it('con la regla no se puede robar a quien tiene menos de 3 puntos', () => {
    const e = escenario(true);
    expect(victimasPosibles(e.mesa, e.conRival(0), e.yo, e.destino)).toEqual([]); // 1 punto
    expect(victimasPosibles(e.mesa, e.conRival(1), e.yo, e.destino)).toEqual([]); // 2 puntos
  });

  it('con 3 puntos o más sí se puede', () => {
    const e = escenario(true);
    expect(victimasPosibles(e.mesa, e.conRival(2), e.yo, e.destino)).toEqual([e.rival]); // 3
    expect(victimasPosibles(e.mesa, e.conRival(4), e.yo, e.destino)).toEqual([e.rival]); // 5
  });

  it('cuentan los puntos públicos, también el gran ejército, pero no las cartas ocultas', () => {
    const e = escenario(true);
    const conEjercito = e.conRival(0, { granEjercito: e.rival }); // 1 + 2 = 3
    expect(victimasPosibles(e.mesa, conEjercito, e.yo, e.destino)).toEqual([e.rival]);

    const ocultas = e.conRival(1); // 2 puntos públicos
    const conCarta = conCambios(ocultas, {
      jugadores: ocultas.jugadores.map((j) =>
        j.id === e.rival ? { ...j, cartasDesarrollo: ['PUNTO_VICTORIA'] } : j,
      ),
    });
    // Con la carta oculta serían 3, pero eso no se ve: sigue protegido (si no, se revelaría).
    expect(victimasPosibles(e.mesa, conCarta, e.yo, e.destino)).toEqual([]);
  });

  it('una ciudad vale 2 puntos para el umbral', () => {
    const e = escenario(true);
    const estado = e.conRival(0, {
      edificios: {
        [e.enCasilla]: { dueno: e.rival, tipo: 'CIUDAD' },
        [e.lejanos[0]!.id]: { dueno: e.rival, tipo: 'POBLADO' },
      },
    });
    expect(victimasPosibles(e.mesa, estado, e.yo, e.destino)).toEqual([e.rival]); // 2 + 1
  });

  it('con dos rivales en la casilla, solo es víctima el que tiene 3 o más', () => {
    const e = escenario(true);
    const base = e.conRival(0);
    const estado = conCambios(base, {
      edificios: {
        ...base.edificios,
        [e.enCasilla2]: { dueno: e.otro, tipo: 'CIUDAD' },
        [e.lejanos[0]!.id]: { dueno: e.otro, tipo: 'POBLADO' },
      },
    });
    expect(victimasPosibles(e.mesa, estado, e.yo, e.destino)).toEqual([e.otro]);
  });
});

describe('Ladrón amistoso: mover el ladrón', () => {
  it('si todos los rivales están protegidos, el ladrón se mueve sin robar', () => {
    const e = escenario(true);
    const resultado = e.mover(e.conRival(1), null);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.eventos.some((ev) => ev.tipo === 'CARTA_ROBADA')).toBe(false);
    }
  });

  it('y pedir robar a un protegido se rechaza', () => {
    const e = escenario(true);
    expect(e.mover(e.conRival(1), e.rival)).toEqual({ ok: false, motivo: 'SIN_VICTIMA_POSIBLE' });
  });

  it('con un rival expuesto hay que elegirlo, y los protegidos no valen', () => {
    const e = escenario(true);
    const base = e.conRival(0);
    const estado = conCambios(base, {
      edificios: {
        ...base.edificios,
        [e.enCasilla2]: { dueno: e.otro, tipo: 'CIUDAD' },
        [e.lejanos[0]!.id]: { dueno: e.otro, tipo: 'POBLADO' },
      },
    });
    expect(e.mover(estado, null)).toMatchObject({ ok: false, motivo: 'VICTIMA_REQUERIDA' });
    expect(e.mover(estado, e.rival)).toMatchObject({
      ok: false,
      motivo: 'VICTIMA_INVALIDA',
      detalle: { victimasPosibles: [e.otro] },
    });
    const bien = e.mover(estado, e.otro);
    expect(bien.ok && bien.eventos.some((ev) => ev.tipo === 'CARTA_ROBADA')).toBe(true);
  });

  it('sin la regla, el mismo rival de 1 punto sí es una víctima obligada', () => {
    const e = escenario(false);
    expect(e.mover(e.conRival(0), null)).toMatchObject({ ok: false, motivo: 'VICTIMA_REQUERIDA' });
  });
});

describe('Ladrón amistoso: caballero', () => {
  it('jugar un caballero tampoco permite robar a un protegido', () => {
    const e = escenario(true);
    const base = e.conRival(1, { fase: 'FASE_PRINCIPAL' });
    const estado = conCambios(base, {
      jugadores: base.jugadores.map((j) =>
        j.id === e.yo ? { ...j, cartasDesarrollo: ['CABALLERO'] } : j,
      ),
    });
    const robando = decidir(mesaDe(e), estado, {
      tipo: 'JUGAR_CABALLERO',
      jugador: e.yo,
      destino: e.destino,
      victima: e.rival,
    });
    expect(robando.ok).toBe(false);
    const sinRobar = decidir(mesaDe(e), estado, {
      tipo: 'JUGAR_CABALLERO',
      jugador: e.yo,
      destino: e.destino,
      victima: null,
    });
    expect(sinRobar.ok).toBe(true);
  });
});

const mesaDe = (e: ReturnType<typeof escenario>) => e.mesa;
