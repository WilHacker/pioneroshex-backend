import { describe, expect, it } from 'vitest';
import { crearRng, mezclar } from '../reglas/azar.js';
import { limitesDePiezas } from '../reglas/costos.js';
import { RECURSOS } from '../reglas/recursos.js';
import { BANCO_POR_RECURSO_CLASICO, crearPartida } from './crear.js';
import { mesaDePrueba } from './pruebas.js';

const IDS4 = ['a', 'b', 'c', 'd'];

const idsDe = (semilla: string): string[] =>
  crearPartida(mesaDePrueba({ semilla }), IDS4).jugadores.map((j) => j.id);

describe('crearPartida', () => {
  describe('validación de ids', () => {
    it('lanza si la cantidad de ids no coincide con los jugadores', () => {
      expect(() => crearPartida(mesaDePrueba(), ['a', 'b'])).toThrow(/jugadores/);
    });

    it('lanza si hay ids repetidos', () => {
      expect(() => crearPartida(mesaDePrueba(), ['a', 'b', 'c', 'a'])).toThrow(/repetid/);
    });

    it('lanza si algún id es vacío', () => {
      expect(() => crearPartida(mesaDePrueba(), ['a', 'b', 'c', ''])).toThrow();
    });
  });

  describe('estado inicial con 4 jugadores', () => {
    const mesa = mesaDePrueba();
    const estado = crearPartida(mesa, IDS4);

    it('arranca en la preparación, sin nada construido', () => {
      expect(estado).toMatchObject({
        config: mesa.config,
        fase: 'PREPARACION_POBLADO',
        turnoDe: 0,
        pasoPreparacion: 0,
        pobladoPendiente: null,
        dados: null,
        tiradas: 0,
        version: 0,
        ganador: null,
        ladron: mesa.tablero.ladron,
      });
      expect(estado.edificios).toEqual({});
      expect(estado.caminos).toEqual({});
    });

    it('los jugadores no comparten objetos entre sí ni con las constantes de reglas', () => {
      const [a, b] = estado.jugadores;
      expect(a.piezasRestantes).not.toBe(b.piezasRestantes);
      expect(a.recursos).not.toBe(b.recursos);
      expect(a.piezasRestantes).not.toBe(limitesDePiezas(4));
    });

    it('no modifica el arreglo de ids recibido', () => {
      const ids = ['a', 'b', 'c', 'd'];
      const copia = [...ids];
      crearPartida(mesa, ids);
      expect(ids).toEqual(copia);
    });

    it('cada jugador empieza sin recursos y con todas sus piezas', () => {
      for (const jugador of estado.jugadores) {
        for (const recurso of RECURSOS) expect(jugador.recursos[recurso]).toBe(0);
        expect(jugador.piezasRestantes).toEqual(limitesDePiezas(4));
      }
    });

    it('el banco tiene 19 de cada recurso', () => {
      for (const recurso of RECURSOS) expect(estado.banco[recurso]).toBe(BANCO_POR_RECURSO_CLASICO);
      expect(BANCO_POR_RECURSO_CLASICO).toBe(19);
    });

    it('sobrevive a un viaje por JSON', () => {
      expect(JSON.parse(JSON.stringify(estado))).toEqual(estado);
    });
  });

  it('el banco se escala a 38 por recurso con 6 jugadores', () => {
    const estado = crearPartida(mesaDePrueba({ jugadores: 6 }), ['a', 'b', 'c', 'd', 'e', 'f']);
    for (const recurso of RECURSOS) expect(estado.banco[recurso]).toBe(38);
    expect(estado.jugadores[0].piezasRestantes).toEqual(limitesDePiezas(6));
  });

  describe('orden de turno', () => {
    it('es una permutación de los ids', () => {
      expect(idsDe('X').toSorted()).toEqual(IDS4);
    });

    it('con la misma semilla da el mismo orden, el de mezclar(ids, semilla:orden)', () => {
      expect(idsDe('X')).toEqual(idsDe('X'));
      // Con el atajo de prueba, la semillaAzar es 'AZAR-X' y el orden sale de 'AZAR-X:orden'.
      expect(idsDe('X')).toEqual(mezclar(IDS4, crearRng('AZAR-X:orden')));
    });

    it('con semillas distintas aparecen órdenes distintos', () => {
      const ordenes = new Set(Array.from({ length: 20 }, (_, i) => idsDe(`S${i}`).join()));
      expect(ordenes.size).toBeGreaterThanOrEqual(2);
    });
  });
});
