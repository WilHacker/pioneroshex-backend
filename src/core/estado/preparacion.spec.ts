import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clave } from '../mapa/coordenadas.js';
import { limitesDePiezas } from '../reglas/costos.js';
import { RECURSOS } from '../reglas/recursos.js';
import { aplicar } from './aplicar.js';
import { puedeColocarPoblado } from './conectividad.js';
import { crearPartida } from './crear.js';
import { decidir } from './decidir.js';
import { jugadorDelPaso } from './preparacion.js';
import { conCambios, mesaDePrueba } from './pruebas.js';
import type { Accion, Estado } from './tipos.js';

const mesa = mesaDePrueba({ jugadores: 3 });
const inicio = crearPartida(mesa, ['a', 'b', 'c']);

const ok = (estado: Estado, accion: Accion): Estado => {
  const r = aplicar(mesa, estado, accion);
  if (!r.ok) throw new Error(`Rechazada: ${r.motivo}`);
  return r.estado;
};
const turnoActual = (e: Estado): string => e.jugadores[e.turnoDe]!.id;
const verticesLegales = (e: Estado): string[] =>
  mesa.mapa.vertices
    .filter((v) => puedeColocarPoblado(mesa, e, turnoActual(e), v.id, { requiereCamino: false }).ok)
    .map((v) => v.id);
const aristaLibreDe = (e: Estado, vertice: string): string =>
  mesa.mapa.aristas.find((a) => a.vertices.includes(vertice) && !(a.id in e.caminos))!.id;

/** Juega un poblado y su camino; devuelve el estado tras el camino. */
function jugarPaso(e: Estado, vertice = verticesLegales(e)[0]!): Estado {
  const jugador = turnoActual(e);
  const conPoblado = ok(e, { tipo: 'COLOCAR_POBLADO_INICIAL', jugador, vertice });
  const arista = aristaLibreDe(conPoblado, vertice);
  return ok(conPoblado, { tipo: 'COLOCAR_CAMINO_INICIAL', jugador, arista });
}
const jugarPasos = (e: Estado, n: number): Estado =>
  Array.from({ length: n }).reduce<Estado>((acc) => jugarPaso(acc), e);

const conPoblado = (): { estado: Estado; vertice: string } => {
  const vertice = verticesLegales(inicio)[0]!;
  const jugador = turnoActual(inicio);
  return { estado: ok(inicio, { tipo: 'COLOCAR_POBLADO_INICIAL', jugador, vertice }), vertice };
};

describe('jugadorDelPaso', () => {
  it('va de ida y vuelta', () => {
    expect([0, 1, 2, 3, 4, 5].map((p) => jugadorDelPaso(p, 3))).toEqual([0, 1, 2, 2, 1, 0]);
  });
});

describe('preparación: flujo completo con 3 jugadores', () => {
  it('los turnos van 0,1,2,2,1,0 y termina en PRE_TIRADA del jugador 0', () => {
    const turnos: number[] = [];
    let estado = inicio;
    for (let i = 0; i < 6; i++) {
      turnos.push(estado.turnoDe);
      estado = jugarPaso(estado);
    }
    expect(turnos).toEqual([0, 1, 2, 2, 1, 0]);
    expect(estado.fase).toBe('PRE_TIRADA');
    expect(estado.turnoDe).toBe(0);
    expect(estado.pasoPreparacion).toBe(6);
    expect(estado.pobladoPendiente).toBeNull();
    const limites = limitesDePiezas(3);
    for (const jugador of estado.jugadores) {
      const poblados = Object.values(estado.edificios).filter((e) => e.dueno === jugador.id);
      const caminos = Object.values(estado.caminos).filter((d) => d === jugador.id);
      expect(poblados).toHaveLength(2);
      expect(caminos).toHaveLength(2);
      expect(jugador.piezasRestantes).toEqual({
        ...limites,
        poblados: limites.poblados - 2,
        caminos: limites.caminos - 2,
      });
    }
  });

  it('tras el poblado pasa a PREPARACION_CAMINO con el mismo jugador y paso', () => {
    const { estado, vertice } = conPoblado();
    expect(estado).toMatchObject({
      fase: 'PREPARACION_CAMINO',
      turnoDe: 0,
      pasoPreparacion: 0,
      pobladoPendiente: vertice,
    });
  });
});

const total = (rec: Readonly<Record<string, number>>): number =>
  RECURSOS.reduce((s, x) => s + rec[x]!, 0);

describe('preparación: recursos del segundo poblado', () => {
  const primeraVuelta = jugarPasos(inicio, 3);

  it('el primer poblado no da recursos', () => {
    const r = aplicar(mesa, inicio, {
      tipo: 'COLOCAR_POBLADO_INICIAL',
      jugador: turnoActual(inicio),
      vertice: verticesLegales(inicio)[0]!,
    });
    if (!r.ok) throw new Error(r.motivo);
    expect(r.eventos.some((e) => e.tipo === 'RECURSOS_REPARTIDOS')).toBe(false);
    expect(r.estado.banco).toEqual(inicio.banco);
  });

  it('el segundo da uno por casilla productiva vecina (el desierto no) y baja el banco', () => {
    const desierto = mesa.tablero.casillas.find((c) => c.terreno === 'DESIERTO')!;
    const vertice = verticesLegales(primeraVuelta).find((id) =>
      mesa.vertice(id)!.casillas.some((h) => clave(h) === clave(desierto.hex)),
    )!;
    const productivas = mesa
      .vertice(vertice)!
      .casillas.filter((h) => clave(h) !== clave(desierto.hex)).length;
    const jugador = turnoActual(primeraVuelta);

    const r = aplicar(mesa, primeraVuelta, { tipo: 'COLOCAR_POBLADO_INICIAL', jugador, vertice });
    if (!r.ok) throw new Error(r.motivo);
    const repartos = r.eventos.filter((e) => e.tipo === 'RECURSOS_REPARTIDOS');

    expect(mesa.vertice(vertice)!.casillas.length).toBeGreaterThan(productivas);
    expect(repartos).toHaveLength(productivas);
    for (const e of repartos) {
      expect(e).toMatchObject({ jugador, cantidad: 1, causa: { tipo: 'PREPARACION', vertice } });
    }
    const mano = r.estado.jugadores.find((j) => j.id === jugador)!.recursos;
    expect(total(mano)).toBe(productivas);
    expect(total(primeraVuelta.banco) - total(r.estado.banco)).toBe(productivas);
  });
});

describe('preparación: rechazos', () => {
  const jugador = turnoActual(inicio);
  const { estado: enCamino, vertice: pendiente } = conPoblado();
  const lejana = mesa.mapa.aristas.find((a) => !a.vertices.includes(pendiente))!.id;

  it('poblado en PREPARACION_CAMINO → FASE_INCORRECTA', () => {
    const vertice = verticesLegales(enCamino)[0]!;
    const accion: Accion = { tipo: 'COLOCAR_POBLADO_INICIAL', jugador, vertice };
    expect(decidir(mesa, enCamino, accion)).toEqual({ ok: false, motivo: 'FASE_INCORRECTA' });
  });

  it('camino sin poblado → FASE_INCORRECTA', () => {
    const accion: Accion = { tipo: 'COLOCAR_CAMINO_INICIAL', jugador, arista: lejana };
    expect(decidir(mesa, inicio, accion)).toEqual({ ok: false, motivo: 'FASE_INCORRECTA' });
  });

  it('jugador equivocado → NO_ES_TU_TURNO', () => {
    const otro = inicio.jugadores[1]!.id;
    const accion: Accion = { tipo: 'COLOCAR_POBLADO_INICIAL', jugador: otro, vertice: pendiente };
    expect(decidir(mesa, inicio, accion)).toEqual({ ok: false, motivo: 'NO_ES_TU_TURNO' });
  });

  it('vértice inventado → VERTICE_INEXISTENTE', () => {
    const accion: Accion = { tipo: 'COLOCAR_POBLADO_INICIAL', jugador, vertice: 'inventado' };
    expect(decidir(mesa, inicio, accion)).toEqual({ ok: false, motivo: 'VERTICE_INEXISTENTE' });
  });

  it('arista inventada → ARISTA_INEXISTENTE', () => {
    const accion: Accion = { tipo: 'COLOCAR_CAMINO_INICIAL', jugador, arista: 'inventada' };
    expect(decidir(mesa, enCamino, accion)).toEqual({ ok: false, motivo: 'ARISTA_INEXISTENTE' });
  });

  it('camino lejos del poblado → CAMINO_NO_ADYACENTE', () => {
    const accion: Accion = { tipo: 'COLOCAR_CAMINO_INICIAL', jugador, arista: lejana };
    expect(decidir(mesa, enCamino, accion)).toEqual({
      ok: false,
      motivo: 'CAMINO_NO_ADYACENTE',
      detalle: { pobladoPendiente: enCamino.pobladoPendiente },
    });
  });

  it('camino pegado al poblado de una colocación anterior (no el pendiente) → CAMINO_NO_ADYACENTE', () => {
    // Tras 3 pasos, el jugador 2 repite turno: ya tiene su primer poblado y pone el segundo.
    const vuelta = jugarPasos(inicio, 3);
    const yo = turnoActual(vuelta);
    const anterior = Object.keys(vuelta.edificios).find((v) => vuelta.edificios[v]!.dueno === yo)!;
    const nuevo = verticesLegales(vuelta)[0]!;
    const enSegundo = ok(vuelta, { tipo: 'COLOCAR_POBLADO_INICIAL', jugador: yo, vertice: nuevo });
    const arista = aristaLibreDe(enSegundo, anterior);
    expect(mesa.arista(arista)!.vertices).not.toContain(nuevo);
    const accion: Accion = { tipo: 'COLOCAR_CAMINO_INICIAL', jugador: yo, arista };
    expect(decidir(mesa, enSegundo, accion)).toEqual({
      ok: false,
      motivo: 'CAMINO_NO_ADYACENTE',
      detalle: { pobladoPendiente: nuevo },
    });
  });

  it('arista con camino → ARISTA_OCUPADA', () => {
    const arista = aristaLibreDe(enCamino, pendiente);
    const ocupada = conCambios(enCamino, { caminos: { [arista]: 'b' } });
    const accion: Accion = { tipo: 'COLOCAR_CAMINO_INICIAL', jugador, arista };
    expect(decidir(mesa, ocupada, accion)).toEqual({
      ok: false,
      motivo: 'ARISTA_OCUPADA',
      detalle: { dueno: 'b' },
    });
  });

  describe('con un poblado ya puesto por otro jugador', () => {
    const siguiente = jugarPaso(inicio);
    const otro = turnoActual(siguiente);
    const ocupado = Object.keys(siguiente.edificios)[0]!;
    const vecino = mesa.vertice(ocupado)!.vecinos[0]!;

    it('vértice ocupado → VERTICE_OCUPADO', () => {
      const accion: Accion = { tipo: 'COLOCAR_POBLADO_INICIAL', jugador: otro, vertice: ocupado };
      expect(decidir(mesa, siguiente, accion)).toEqual({
        ok: false,
        motivo: 'VERTICE_OCUPADO',
        detalle: { dueno: siguiente.edificios[ocupado]?.dueno },
      });
    });

    it('vértice vecino → DEMASIADO_CERCA', () => {
      const accion: Accion = { tipo: 'COLOCAR_POBLADO_INICIAL', jugador: otro, vertice: vecino };
      expect(decidir(mesa, siguiente, accion)).toEqual({
        ok: false,
        motivo: 'DEMASIADO_CERCA',
        detalle: { vecinoOcupado: ocupado, dueno: siguiente.edificios[ocupado]?.dueno },
      });
    });
  });
});

describe('preparación: robustez', () => {
  it('ids inventados nunca lanzan y siempre se rechazan, en cualquier fase', () => {
    fc.assert(
      fc.property(fc.string(), (id) => {
        for (const estado of [inicio, conPoblado().estado]) {
          const jugador = turnoActual(estado);
          for (const accion of [
            { tipo: 'COLOCAR_POBLADO_INICIAL', jugador, vertice: id },
            { tipo: 'COLOCAR_CAMINO_INICIAL', jugador, arista: id },
          ] as const) {
            expect(decidir(mesa, estado, accion).ok).toBe(false);
          }
        }
      }),
    );
  });

  it('no muta el estado y no comparte el objeto costo entre eventos', () => {
    const copia = structuredClone(inicio);
    const jugador = turnoActual(inicio);
    const vertice = verticesLegales(inicio)[0]!;
    const accion: Accion = { tipo: 'COLOCAR_POBLADO_INICIAL', jugador, vertice };
    const a = decidir(mesa, inicio, accion);
    const b = decidir(mesa, inicio, accion);
    expect(inicio).toEqual(copia);
    if (!a.ok || !b.ok) throw new Error('debía aceptarse');
    const costo = (d: typeof a): unknown => (d.eventos[0] as { costo: unknown }).costo;
    expect(costo(a)).toEqual({});
    expect(costo(a)).not.toBe(costo(b));
  });
});
