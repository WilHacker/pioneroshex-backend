import { type Draft, produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { crearPartida } from './crear.js';
import {
  decidirComprarCarta,
  decidirJugarAbundancia,
  decidirJugarCaballero,
  decidirJugarConstruccionCarreteras,
  decidirJugarMonopolio,
} from './desarrollo.js';
import { aristaEntre, conCambios, mesaDePrueba } from './pruebas.js';
import type { Estado } from './tipos.js';

const mesa = mesaDePrueba();
const base = crearPartida(mesa, ['alice', 'bob', 'carol', 'dave']);
const [j0, j1] = base.jugadores.map((j) => j.id) as [string, string];

function estadoListo(): Estado {
  return produce(base, (b) => {
    b.fase = 'FASE_PRINCIPAL';
    b.turnoDe = 0;
    b.pasoPreparacion = 8;
    b.jugadores[0]!.recursos = { MADERA: 2, LADRILLO: 2, OVEJA: 5, TRIGO: 5, MINERAL: 5 };
    for (let i = 1; i < b.jugadores.length; i++) {
      b.jugadores[i]!.recursos = { MADERA: 1, LADRILLO: 1, OVEJA: 2, TRIGO: 2, MINERAL: 2 };
    }
  });
}

describe('desarrollo', () => {
  describe('comprar carta de desarrollo', () => {
    it('compra una carta pagando oveja, trigo y mineral; la carta queda en cartasCompradasEsteTurno', () => {
      const estado = estadoListo();
      const r = decidirComprarCarta(mesa, estado, {
        tipo: 'COMPRAR_CARTA_DESARROLLO',
        jugador: j0,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.eventos[0]?.tipo).toBe('CARTA_DESARROLLO_COMPRADA');
    });

    it('falla con RECURSOS_INSUFICIENTES si faltan materiales', () => {
      const estado = produce(estadoListo(), (b) => {
        b.jugadores[0]!.recursos = { MADERA: 0, LADRILLO: 0, OVEJA: 0, TRIGO: 0, MINERAL: 0 };
      });
      const r = decidirComprarCarta(mesa, estado, {
        tipo: 'COMPRAR_CARTA_DESARROLLO',
        jugador: j0,
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.motivo).toBe('RECURSOS_INSUFICIENTES');
    });

    it('falla si el mazo está agotado', () => {
      const estado = conCambios(estadoListo(), { mazo: [] });
      const r = decidirComprarCarta(mesa, estado, {
        tipo: 'COMPRAR_CARTA_DESARROLLO',
        jugador: j0,
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.motivo).toBe('MAZO_AGOTADO');
    });
  });

  describe('jugar caballero', () => {
    it('mueve el ladrón, roba carta y suma caballero; otorga Gran Ejército al llegar a 3', () => {
      const v0 = mesa.mapa.vertices[0]!;
      const c1 = mesa.mapa.casillas[1]!;
      const vDestino = mesa.mapa.vertices.find((v) =>
        v.casillas.some((cas) => cas.q === c1.q && cas.r === c1.r),
      )!;

      const estado = produce(estadoListo(), (b) => {
        b.edificios[v0.id] = { dueno: j0, tipo: 'POBLADO' };
        b.edificios[vDestino.id] = { dueno: j1, tipo: 'POBLADO' };
        b.jugadores[0]!.cartasDesarrollo = ['CABALLERO'];
        b.jugadores[0]!.caballerosJugados = 2;
      });

      const r = decidirJugarCaballero(mesa, estado, {
        tipo: 'JUGAR_CABALLERO',
        jugador: j0,
        destino: c1,
        victima: j1,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const tipos = r.eventos.map((e) => e.tipo);
      expect(tipos).toContain('CABALLERO_JUGADO');
      expect(tipos).toContain('CARTA_ROBADA');
      expect(tipos).toContain('GRAN_EJERCITO_CAMBIADO');
    });

    describe('rechazos con datos', () => {
      const c1 = mesa.mapa.casillas[1]!;
      const vDestino = mesa.mapa.vertices.find((v) =>
        v.casillas.some((cas) => cas.q === c1.q && cas.r === c1.r),
      )!;
      const conCaballero = (cambios: (b: Draft<Estado>) => void): Estado =>
        produce(estadoListo(), (b) => {
          b.edificios[vDestino.id] = { dueno: j1, tipo: 'POBLADO' };
          b.jugadores[0]!.cartasDesarrollo = ['CABALLERO'];
          cambios(b);
        });
      const jugar = (estado: Estado, victima: string | null) =>
        decidirJugarCaballero(mesa, estado, {
          tipo: 'JUGAR_CABALLERO',
          jugador: j0,
          destino: c1,
          victima,
        });

      it('VICTIMA_REQUERIDA dice a quién se puede robar', () => {
        expect(
          jugar(
            conCaballero(() => {}),
            null,
          ),
        ).toEqual({
          ok: false,
          motivo: 'VICTIMA_REQUERIDA',
          detalle: { victimasPosibles: [j1] },
        });
      });

      it('VICTIMA_INVALIDA dice a quién se puede robar', () => {
        expect(
          jugar(
            conCaballero(() => {}),
            j0,
          ),
        ).toEqual({
          ok: false,
          motivo: 'VICTIMA_INVALIDA',
          detalle: { victimasPosibles: [j1] },
        });
      });

      it('MISMO_DESTINO dice dónde está ya el ladrón', () => {
        const estado = conCaballero((b) => {
          b.ladron = { ...c1 };
        });
        expect(jugar(estado, j1)).toEqual({
          ok: false,
          motivo: 'MISMO_DESTINO',
          detalle: { ladronEn: c1 },
        });
      });
    });

    it('no permite jugar una carta comprada en el mismo turno', () => {
      const estado = produce(estadoListo(), (b) => {
        b.jugadores[0]!.cartasDesarrollo = [];
        b.jugadores[0]!.cartasCompradasEsteTurno = ['CABALLERO'];
      });
      const r = decidirJugarCaballero(mesa, estado, {
        tipo: 'JUGAR_CABALLERO',
        jugador: j0,
        destino: mesa.mapa.casillas[1]!,
        victima: null,
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.motivo).toBe('CARTA_COMPRADA_ESTE_TURNO');
    });

    it('no permite jugar dos cartas de desarrollo en el mismo turno', () => {
      const estado = produce(estadoListo(), (b) => {
        b.cartaJugadaEsteTurno = true;
        b.jugadores[0]!.cartasDesarrollo = ['CABALLERO'];
      });
      const r = decidirJugarCaballero(mesa, estado, {
        tipo: 'JUGAR_CABALLERO',
        jugador: j0,
        destino: mesa.mapa.casillas[1]!,
        victima: null,
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.motivo).toBe('YA_JUGASTE_CARTA_ESTE_TURNO');
    });
  });

  describe('jugar abundancia', () => {
    it('toma 2 recursos del banco a elección', () => {
      const estado = produce(estadoListo(), (b) => {
        b.jugadores[0]!.cartasDesarrollo = ['ABUNDANCIA'];
      });
      const r = decidirJugarAbundancia(mesa, estado, {
        tipo: 'JUGAR_ABUNDANCIA',
        jugador: j0,
        recursos: ['MADERA', 'MINERAL'],
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.eventos[0]?.tipo).toBe('ABUNDANCIA_JUGADA');
    });

    it('rechaza con BANCO_AGOTADO y dice qué recurso falta y cuánto queda', () => {
      const estado = produce(estadoListo(), (b) => {
        b.jugadores[0]!.cartasDesarrollo = ['ABUNDANCIA'];
        b.banco.MINERAL = 1;
      });
      const r = decidirJugarAbundancia(mesa, estado, {
        tipo: 'JUGAR_ABUNDANCIA',
        jugador: j0,
        recursos: ['MINERAL', 'MINERAL'],
      });
      expect(r).toEqual({
        ok: false,
        motivo: 'BANCO_AGOTADO',
        detalle: { recurso: 'MINERAL', pedido: 2, disponible: 1 },
      });
    });
  });

  describe('jugar monopolio', () => {
    it('roba todas las cartas del recurso elegido de todos los rivales', () => {
      const estado = produce(estadoListo(), (b) => {
        b.jugadores[0]!.cartasDesarrollo = ['MONOPOLIO'];
        for (let i = 1; i < b.jugadores.length; i++) {
          b.jugadores[i]!.recursos = { MADERA: 3, LADRILLO: 0, OVEJA: 0, TRIGO: 0, MINERAL: 0 };
        }
      });
      const r = decidirJugarMonopolio(mesa, estado, {
        tipo: 'JUGAR_MONOPOLIO',
        jugador: j0,
        recurso: 'MADERA',
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.eventos[0]?.tipo).toBe('MONOPOLIO_JUGADO');
      if (r.eventos[0]?.tipo === 'MONOPOLIO_JUGADO') {
        expect(r.eventos[0].cantidadRobada).toBe(9); // 3 rivales * 3 maderas
      }
    });
  });

  describe('jugar construccion de carreteras', () => {
    it('coloca hasta 2 caminos gratis conectados a su red', () => {
      const v0 = mesa.mapa.vertices[0]!;
      const v1 = mesa.vertice(v0.vecinos[0]!)!;
      const v2 = mesa.vertice(v1.vecinos.find((id) => id !== v0.id)!)!;
      const v3 = mesa.vertice(v2.vecinos.find((id) => id !== v1.id)!)!;

      const e1 = aristaEntre(mesa, v0.id, v1.id);
      const e2 = aristaEntre(mesa, v1.id, v2.id);
      const e3 = aristaEntre(mesa, v2.id, v3.id);

      const estado = produce(estadoListo(), (b) => {
        b.edificios[v0.id] = { dueno: j0, tipo: 'POBLADO' };
        b.caminos[e1] = j0;
        b.jugadores[0]!.cartasDesarrollo = ['CONSTRUCCION_CARRETERAS'];
      });

      const r = decidirJugarConstruccionCarreteras(mesa, estado, {
        tipo: 'JUGAR_CONSTRUCCION_CARRETERAS',
        jugador: j0,
        aristas: [e2, e3],
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.eventos[0]?.tipo).toBe('CONSTRUCCION_CARRETERAS_JUGADA');
    });

    describe('rechazos con datos', () => {
      const v0 = mesa.mapa.vertices[0]!;
      const v1 = mesa.vertice(v0.vecinos[0]!)!;
      const v2 = mesa.vertice(v1.vecinos.find((id) => id !== v0.id)!)!;
      const e1 = aristaEntre(mesa, v0.id, v1.id);
      const e2 = aristaEntre(mesa, v1.id, v2.id);
      const conRed = (cambios: (b: Draft<Estado>) => void): Estado =>
        produce(estadoListo(), (b) => {
          b.edificios[v0.id] = { dueno: j0, tipo: 'POBLADO' };
          b.caminos[e1] = j0;
          b.jugadores[0]!.cartasDesarrollo = ['CONSTRUCCION_CARRETERAS'];
          cambios(b);
        });
      const jugar = (estado: Estado, aristas: readonly [string] | readonly [string, string]) =>
        decidirJugarConstruccionCarreteras(mesa, estado, {
          tipo: 'JUGAR_CONSTRUCCION_CARRETERAS',
          jugador: j0,
          aristas,
        });

      it('ARISTAS_INVALIDAS dice cuántos caminos se podían poner y cuántos se pidieron', () => {
        const estado = conRed((b) => {
          b.jugadores[0]!.piezasRestantes.caminos = 1;
        });
        expect(jugar(estado, [e2, aristaEntre(mesa, v2.id, v2.vecinos[0]!)])).toEqual({
          ok: false,
          motivo: 'ARISTAS_INVALIDAS',
          detalle: { maximo: 1, pedidas: 2 },
        });
      });

      it('pedir dos veces la misma arista es ARISTA_OCUPADA por tu propio primer camino', () => {
        expect(
          jugar(
            conRed(() => {}),
            [e2, e2],
          ),
        ).toEqual({
          ok: false,
          motivo: 'ARISTA_OCUPADA',
          detalle: { dueno: j0 },
        });
      });
    });
  });
});
