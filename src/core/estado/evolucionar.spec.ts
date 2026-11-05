import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { COSTOS } from '../reglas/costos.js';
import { crearPartida } from './crear.js';
import { evolucionar } from './evolucionar.js';
import { conCambios, mesaDePrueba } from './pruebas.js';
import type { Estado, Evento, Jugador } from './tipos.js';

const mesa = mesaDePrueba();
const inicial = crearPartida(mesa, ['a', 'b', 'c', 'd']);
const j0 = inicial.jugadores[0]!.id;
const vertice = mesa.mapa.vertices[0]!.id;
const arista = mesa.mapa.aristas[0]!.id;

const base: Estado = produce(inicial, (borrador) => {
  for (const j of borrador.jugadores) {
    j.recursos = { MADERA: 5, LADRILLO: 5, OVEJA: 5, TRIGO: 5, MINERAL: 5 };
  }
});
const yo = (estado: Estado): Jugador => estado.jugadores.find((j) => j.id === j0)!;

/** Aplica el evento comprobando que no muta la entrada y que la versión sube 1. */
function evolucionarSinMutar(estado: Estado, evento: Evento): Estado {
  const copia = structuredClone(estado);
  const nuevo = evolucionar(estado, evento);
  expect(estado).toEqual(copia);
  expect(nuevo.version).toBe(estado.version + 1);
  return nuevo;
}

describe('evolucionar', () => {
  it('POBLADO_COLOCADO de construcción: edificio, pieza, costo al banco; conserva el pendiente', () => {
    const costo = COSTOS.POBLADO;
    const pendiente = mesa.mapa.vertices[5]!.id;
    const conPendiente = conCambios(base, { pobladoPendiente: pendiente });
    const nuevo = evolucionarSinMutar(conPendiente, {
      tipo: 'POBLADO_COLOCADO',
      jugador: j0,
      vertice,
      origen: 'CONSTRUCCION',
      costo,
    });
    expect(nuevo.edificios[vertice]).toEqual({ dueno: j0, tipo: 'POBLADO' });
    expect(yo(nuevo).piezasRestantes.poblados).toBe(yo(base).piezasRestantes.poblados - 1);
    expect(yo(nuevo).recursos).toEqual({ MADERA: 4, LADRILLO: 4, OVEJA: 4, TRIGO: 4, MINERAL: 5 });
    expect(nuevo.banco.MADERA).toBe(base.banco.MADERA + 1);
    expect(nuevo.banco.MINERAL).toBe(base.banco.MINERAL);
    expect(nuevo.pobladoPendiente).toBe(pendiente);
  });

  it('POBLADO_COLOCADO de preparación fija pobladoPendiente', () => {
    const nuevo = evolucionarSinMutar(base, {
      tipo: 'POBLADO_COLOCADO',
      jugador: j0,
      vertice,
      origen: 'PREPARACION',
      costo: {},
    });
    expect(nuevo.pobladoPendiente).toBe(vertice);
    expect(yo(nuevo).recursos).toEqual(yo(base).recursos);
    expect(nuevo.banco).toEqual(base.banco);
  });

  it('CIUDAD_COLOCADA: tipo CIUDAD, devuelve un poblado, gasta una ciudad y paga', () => {
    const estado = conCambios(base, { edificios: { [vertice]: { dueno: j0, tipo: 'POBLADO' } } });
    const nuevo = evolucionarSinMutar(estado, {
      tipo: 'CIUDAD_COLOCADA',
      jugador: j0,
      vertice,
      costo: COSTOS.CIUDAD,
    });
    expect(nuevo.edificios[vertice]).toEqual({ dueno: j0, tipo: 'CIUDAD' });
    expect(yo(nuevo).piezasRestantes.poblados).toBe(yo(estado).piezasRestantes.poblados + 1);
    expect(yo(nuevo).piezasRestantes.ciudades).toBe(yo(estado).piezasRestantes.ciudades - 1);
    expect(yo(nuevo).recursos.TRIGO).toBe(3);
    expect(yo(nuevo).recursos.MINERAL).toBe(2);
    expect(nuevo.banco.MINERAL).toBe(estado.banco.MINERAL + 3);
  });

  it('CAMINO_COLOCADO de construcción: camino, pieza y costo', () => {
    const estado = conCambios(base, { pobladoPendiente: vertice });
    const nuevo = evolucionarSinMutar(estado, {
      tipo: 'CAMINO_COLOCADO',
      jugador: j0,
      arista,
      origen: 'CONSTRUCCION',
      costo: COSTOS.CAMINO,
    });
    expect(nuevo.caminos[arista]).toBe(j0);
    expect(yo(nuevo).piezasRestantes.caminos).toBe(yo(estado).piezasRestantes.caminos - 1);
    expect(yo(nuevo).recursos.MADERA).toBe(4);
    expect(yo(nuevo).recursos.LADRILLO).toBe(4);
    expect(nuevo.banco.LADRILLO).toBe(estado.banco.LADRILLO + 1);
    expect(nuevo.pobladoPendiente).toBe(vertice);
  });

  it('CAMINO_COLOCADO de preparación limpia pobladoPendiente', () => {
    const estado = conCambios(base, { pobladoPendiente: vertice });
    const nuevo = evolucionarSinMutar(estado, {
      tipo: 'CAMINO_COLOCADO',
      jugador: j0,
      arista,
      origen: 'PREPARACION',
      costo: {},
    });
    expect(nuevo.pobladoPendiente).toBeNull();
    expect(nuevo.caminos[arista]).toBe(j0);
  });

  it('DADOS_TIRADOS guarda los dados y cuenta la tirada', () => {
    const nuevo = evolucionarSinMutar(base, { tipo: 'DADOS_TIRADOS', jugador: j0, dados: [3, 4] });
    expect(nuevo.dados).toEqual([3, 4]);
    expect(nuevo.tiradas).toBe(base.tiradas + 1);
  });

  it('RECURSOS_REPARTIDOS pasa cartas del banco a la mano', () => {
    const nuevo = evolucionarSinMutar(base, {
      tipo: 'RECURSOS_REPARTIDOS',
      jugador: j0,
      recurso: 'OVEJA',
      cantidad: 2,
      causa: { tipo: 'PREPARACION', vertice, casilla: '0,0,0' },
    });
    expect(yo(nuevo).recursos.OVEJA).toBe(7);
    expect(nuevo.banco.OVEJA).toBe(base.banco.OVEJA - 2);
  });

  it('PRODUCCION_BLOQUEADA solo sube la versión', () => {
    const nuevo = evolucionarSinMutar(base, {
      tipo: 'PRODUCCION_BLOQUEADA',
      recurso: 'TRIGO',
      pedido: 3,
      disponible: 1,
    });
    expect(nuevo).toEqual({ ...base, version: base.version + 1 });
  });

  it('FASE_CAMBIADA fija fase, turnoDe y pasoPreparacion', () => {
    const nuevo = evolucionarSinMutar(base, {
      tipo: 'FASE_CAMBIADA',
      fase: 'PREPARACION_CAMINO',
      turnoDe: 2,
      pasoPreparacion: 3,
    });
    expect(nuevo).toMatchObject({ fase: 'PREPARACION_CAMINO', turnoDe: 2, pasoPreparacion: 3 });
  });

  it('TURNO_TERMINADO pasa el turno, vuelve a PRE_TIRADA y borra los dados', () => {
    const estado = conCambios(base, { fase: 'FASE_PRINCIPAL', dados: [6, 6] });
    const nuevo = evolucionarSinMutar(estado, {
      tipo: 'TURNO_TERMINADO',
      jugador: j0,
      siguiente: 1,
    });
    expect(nuevo).toMatchObject({ turnoDe: 1, fase: 'PRE_TIRADA', dados: null });
  });

  it('PARTIDA_GANADA termina la partida con ganador', () => {
    const nuevo = evolucionarSinMutar(base, { tipo: 'PARTIDA_GANADA', jugador: j0, puntos: 10 });
    expect(nuevo).toMatchObject({ fase: 'FIN', ganador: j0 });
  });

  it('un jugador inexistente lanza un error claro', () => {
    expect(() =>
      evolucionar(base, { tipo: 'DADOS_TIRADOS', jugador: 'nadie', dados: [1, 1] }),
    ).toThrow('Jugador inexistente: nadie');
  });

  it('el estado resultante es serializable a JSON y está congelado', () => {
    const nuevo = evolucionar(base, { tipo: 'DADOS_TIRADOS', jugador: j0, dados: [2, 5] });
    expect(JSON.parse(JSON.stringify(nuevo))).toEqual(nuevo);
    expect(Object.isFrozen(nuevo)).toBe(true);
    expect(Object.isFrozen(nuevo.dados)).toBe(true);
  });
});
