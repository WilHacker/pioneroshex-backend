import { describe, expect, it } from 'vitest';
import { crearGameConfig } from '../partida/game-config.js';
import { crearPartida } from './crear.js';
import { eventosPara } from './eventos.js';
import { paso } from './paso.js';
import { conCambios, mesaDePrueba } from './pruebas.js';
import type { Estado, Evento, JugadorId } from './tipos.js';
import { vistaPara } from './vista.js';

const ids = ['a', 'b', 'c'];

function partida(reglas: { ocultarBanco?: boolean; manosVisibles?: boolean } = {}) {
  const mesa = mesaDePrueba({ jugadores: 3, ...reglas });
  const inicial = crearPartida(mesa, ids);
  const [yo, otro, tercero] = inicial.jugadores.map((j) => j.id) as [
    JugadorId,
    JugadorId,
    JugadorId,
  ];
  const estado: Estado = conCambios(inicial, {
    fase: 'FASE_PRINCIPAL',
    pasoPreparacion: 6,
    turnoDe: 0,
    jugadores: inicial.jugadores.map((j) => ({
      ...j,
      recursos: { MADERA: 2, LADRILLO: 1, OVEJA: 0, TRIGO: 3, MINERAL: 0 },
      cartasDesarrollo: j.id === otro ? ['CABALLERO'] : [],
    })),
  });
  return { mesa, estado, yo, otro, tercero };
}

describe('GameConfig: ocultarBanco y manosVisibles', () => {
  it('por defecto están apagadas', () => {
    const { config } = mesaDePrueba();
    expect(config.ocultarBanco).toBe(false);
    expect(config.manosVisibles).toBe(false);
  });

  it('se pueden activar y solo admiten verdadero o falso', () => {
    expect(mesaDePrueba({ ocultarBanco: true }).config.ocultarBanco).toBe(true);
    expect(mesaDePrueba({ manosVisibles: true }).config.manosVisibles).toBe(true);
    const base = { semillaMapa: 'm', semillaAzar: 'azar-secreto' };
    expect(() => crearGameConfig({ ...base, ocultarBanco: 'si' as never })).toThrow(/ocultarBanco/);
    expect(() => crearGameConfig({ ...base, manosVisibles: 0 as never })).toThrow(/manosVisibles/);
  });
});

describe('ocultar las cartas del banco', () => {
  it('sin la regla, la vista trae lo que hay en el banco y cuántas cartas quedan en el mazo', () => {
    const { estado, yo } = partida();
    const vista = vistaPara(estado, yo);
    expect(vista.banco).toEqual(estado.banco);
    expect(vista.tamanoMazo).toBe(estado.mazo.length);
  });

  it('con la regla, el banco y el mazo no viajan: no se mandan para esconderlos en pantalla', () => {
    const { estado, yo, otro } = partida({ ocultarBanco: true });
    for (const observador of [yo, otro, null]) {
      const vista = vistaPara(estado, observador);
      expect(vista.banco).toBeNull();
      expect(vista.tamanoMazo).toBeNull();
    }
  });

  it('tampoco se cuela por el evento de producción bloqueada', () => {
    const evento: Evento = {
      tipo: 'PRODUCCION_BLOQUEADA',
      recurso: 'MADERA',
      pedido: 5,
      disponible: 2,
    };
    const oculto = eventosPara([evento], 'a', {
      comercioPrivado: false,
      tratos: [],
      ocultarBanco: true,
      manosVisibles: false,
    });
    expect(oculto[0]).toMatchObject({ tipo: 'PRODUCCION_BLOQUEADA', recurso: 'MADERA', pedido: 5 });
    expect((oculto[0] as { disponible: number | null }).disponible).toBeNull();

    const visible = eventosPara([evento], 'a');
    expect((visible[0] as { disponible: number | null }).disponible).toBe(2);
  });

  it('las notificaciones de una jugada llevan la vista con el banco oculto', () => {
    const { mesa, estado, yo, otro } = partida({ ocultarBanco: true });
    const r = paso(mesa, estado, { tipo: 'TERMINAR_TURNO', jugador: yo }, [yo, otro]);
    if (!r.ok) throw new Error(r.motivo);
    for (const n of r.notificaciones) expect(n.vista.banco).toBeNull();
  });
});

describe('cartas a la vista', () => {
  it('sin la regla, solo ves tu mano; la de los demás es un secreto', () => {
    const { estado, yo, otro } = partida();
    const vista = vistaPara(estado, yo);
    expect(vista.jugadores.find((j) => j.id === yo)!.recursos).not.toBeNull();
    expect(vista.jugadores.find((j) => j.id === otro)!.recursos).toBeNull();
  });

  it('con la regla, todos ven las cartas de recursos de todos, también un espectador', () => {
    const { estado, yo, otro, tercero } = partida({ manosVisibles: true });
    for (const observador of [yo, otro, null]) {
      const vista = vistaPara(estado, observador);
      for (const id of [yo, otro, tercero]) {
        const mano = vista.jugadores.find((j) => j.id === id)!.recursos;
        expect(mano).toEqual({ MADERA: 2, LADRILLO: 1, OVEJA: 0, TRIGO: 3, MINERAL: 0 });
      }
    }
  });

  it('las cartas de desarrollo siguen siendo secretas: ahí están los puntos ocultos', () => {
    const { estado, yo, otro } = partida({ manosVisibles: true });
    const vista = vistaPara(estado, yo);
    expect(vista.jugadores.find((j) => j.id === otro)!.cartasDesarrollo).toBeNull();
  });

  it('la vista no comparte referencias con la mano del estado', () => {
    const { estado, yo, otro } = partida({ manosVisibles: true });
    const mano = vistaPara(estado, yo).jugadores.find((j) => j.id === otro)!.recursos!;
    expect(mano).not.toBe(estado.jugadores.find((j) => j.id === otro)!.recursos);
  });

  it('lo que se roba con el ladrón también se ve, porque las manos ya son públicas', () => {
    const robo: Evento = { tipo: 'CARTA_ROBADA', ladron: 'a', victima: 'b', recurso: 'TRIGO' };
    const ajeno = eventosPara([robo], 'c', {
      comercioPrivado: false,
      tratos: [],
      ocultarBanco: false,
      manosVisibles: true,
    });
    expect(ajeno[0]).toMatchObject({ recurso: 'TRIGO' });
    const secreto = eventosPara([robo], 'c');
    expect(secreto[0]).toMatchObject({ recurso: null });
  });

  it('y lo que se roba con un caballero, igual', () => {
    const caballero: Evento = {
      tipo: 'CABALLERO_JUGADO',
      jugador: 'a',
      destino: { q: 0, r: 0, s: 0 },
      victima: 'b',
      recursoRobado: 'TRIGO',
    } as never;
    const ajeno = eventosPara([caballero], 'c', {
      comercioPrivado: false,
      tratos: [],
      ocultarBanco: false,
      manosVisibles: true,
    });
    expect(ajeno[0]).toMatchObject({ recursoRobado: 'TRIGO' });
  });

  it('la compra de una carta de desarrollo sigue sin enseñar qué carta es', () => {
    const compra: Evento = {
      tipo: 'CARTA_DESARROLLO_COMPRADA',
      jugador: 'a',
      carta: 'CABALLERO',
    } as never;
    const ajeno = eventosPara([compra], 'c', {
      comercioPrivado: false,
      tratos: [],
      ocultarBanco: false,
      manosVisibles: true,
    });
    expect(ajeno[0]).toMatchObject({ carta: null });
  });
});
