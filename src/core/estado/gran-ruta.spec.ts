import { describe, expect, it } from 'vitest';
import { verticesDeCasilla } from '../mapa/mapa.js';
import { crearPartida } from './crear.js';
import { calcularLongitudCamino, evaluarGranRuta } from './gran-ruta.js';
import { aristaEntre, conCambios, mesaDePrueba } from './pruebas.js';
import type { Estado } from './tipos.js';

const mesa = mesaDePrueba();
const base = crearPartida(mesa, ['alice', 'bob', 'carol', 'dave']);
const [j0, j1] = base.jugadores.map((j) => j.id) as [string, string];

describe('gran-ruta', () => {
  it('sin caminos devuelve longitud 0', () => {
    expect(calcularLongitudCamino(mesa, base, j0)).toBe(0);
  });

  it('un camino suelto devuelve longitud 1', () => {
    const e0 = mesa.mapa.aristas[0]!.id;
    const estado = conCambios(base, { caminos: { [e0]: j0 } });
    expect(calcularLongitudCamino(mesa, estado, j0)).toBe(1);
  });

  it('camino continuo de 3 aristas consecutivas mide 3', () => {
    // Busca 3 aristas consecutivas
    const v0 = mesa.mapa.vertices[0]!;
    const v1Id = v0.vecinos[0]!;
    const v1 = mesa.vertice(v1Id)!;
    const v2Id = v1.vecinos.find((id) => id !== v0.id)!;
    const v2 = mesa.vertice(v2Id)!;
    const v3Id = v2.vecinos.find((id) => id !== v1.id)!;

    const e1 = aristaEntre(mesa, v0.id, v1.id);
    const e2 = aristaEntre(mesa, v1.id, v2.id);
    const e3 = aristaEntre(mesa, v2.id, v3Id);

    const estado = conCambios(base, {
      caminos: { [e1]: j0, [e2]: j0, [e3]: j0 },
    });
    expect(calcularLongitudCamino(mesa, estado, j0)).toBe(3);
  });

  it('un poblado rival en un vértice intermedio corta el camino', () => {
    const v0 = mesa.mapa.vertices[0]!;
    const v1Id = v0.vecinos[0]!;
    const v1 = mesa.vertice(v1Id)!;
    const v2Id = v1.vecinos.find((id) => id !== v0.id)!;

    const e1 = aristaEntre(mesa, v0.id, v1.id);
    const e2 = aristaEntre(mesa, v1.id, v2Id);

    // Sin corte rival: longitud 2
    const sinCorte = conCambios(base, { caminos: { [e1]: j0, [e2]: j0 } });
    expect(calcularLongitudCamino(mesa, sinCorte, j0)).toBe(2);

    // Con poblado rival en v1: el camino se corta en dos segmentos de 1
    const conCorte = conCambios(sinCorte, {
      edificios: { [v1.id]: { dueno: j1, tipo: 'POBLADO' } },
    });
    expect(calcularLongitudCamino(mesa, conCorte, j0)).toBe(1);
  });

  it('un poblado propio en el vértice intermedio NO corta el camino', () => {
    const v0 = mesa.mapa.vertices[0]!;
    const v1Id = v0.vecinos[0]!;
    const v1 = mesa.vertice(v1Id)!;
    const v2Id = v1.vecinos.find((id) => id !== v0.id)!;

    const e1 = aristaEntre(mesa, v0.id, v1.id);
    const e2 = aristaEntre(mesa, v1.id, v2Id);

    const conEdificioPropio = conCambios(base, {
      caminos: { [e1]: j0, [e2]: j0 },
      edificios: { [v1.id]: { dueno: j0, tipo: 'POBLADO' } },
    });
    expect(calcularLongitudCamino(mesa, conEdificioPropio, j0)).toBe(2);
  });

  describe('evaluarGranRuta', () => {
    it('nadie tiene la gran ruta si nadie alcanza al menos 5 caminos', () => {
      const res = evaluarGranRuta(mesa, base);
      expect(res.titular).toBeNull();
      expect(res.longitud).toBe(0);
    });

    it('otorga la gran ruta al primer jugador que alcanza al menos 5 caminos', () => {
      // Creamos una cadena de 5 caminos para j0
      const c = mesa.mapa.casillas[0]!;
      const verts = verticesDeCasilla(c);
      const e0 = aristaEntre(mesa, verts[0]!, verts[1]!);
      const e1 = aristaEntre(mesa, verts[1]!, verts[2]!);
      const e2 = aristaEntre(mesa, verts[2]!, verts[3]!);
      const e3 = aristaEntre(mesa, verts[3]!, verts[4]!);
      const e4 = aristaEntre(mesa, verts[4]!, verts[5]!);

      const estado = conCambios(base, {
        caminos: { [e0]: j0, [e1]: j0, [e2]: j0, [e3]: j0, [e4]: j0 },
      });
      const res = evaluarGranRuta(mesa, estado);
      expect(res.titular).toBe(j0);
      expect(res.longitud).toBe(5);
    });

    it('un rival necesita estrictamente superar la longitud para quitar la gran ruta', () => {
      const estadoConTitular: Estado = conCambios(base, {
        granRuta: j0,
        longitudGranRuta: 5,
      });
      // Si j1 iguala con 5, no se la quita
      // Si j1 tiene 6, se la quita
      const resIgual = evaluarGranRuta(mesa, estadoConTitular, { [j0]: 5, [j1]: 5 });
      expect(resIgual.titular).toBe(j0);

      const resSupera = evaluarGranRuta(mesa, estadoConTitular, { [j0]: 5, [j1]: 6 });
      expect(resSupera.titular).toBe(j1);
      expect(resSupera.longitud).toBe(6);
    });
  });
});
