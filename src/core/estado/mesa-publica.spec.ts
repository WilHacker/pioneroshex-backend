import { describe, expect, it } from 'vitest';
import { mesaPublica } from './mesa-publica.js';
import { mesaDePrueba } from './pruebas.js';

const mesa = mesaDePrueba();

describe('mesaPublica', () => {
  const publica = mesaPublica(mesa);

  it('describe el tablero clásico completo: 19 casillas, 54 vértices y 72 aristas', () => {
    expect(publica.radio).toBe(2);
    expect(publica.casillas).toHaveLength(19);
    expect(publica.vertices).toHaveLength(54);
    expect(publica.aristas).toHaveLength(72);
    expect(publica.puertos).toHaveLength(mesa.puertos.length);
  });

  it('cada casilla trae su terreno, su ficha y su posición', () => {
    publica.casillas.forEach((c, i) => {
      const original = mesa.tablero.casillas[i]!;
      expect(c.hex).toEqual(original.hex);
      expect(c.terreno).toBe(original.terreno);
      expect(c.ficha).toBe(original.ficha);
      expect(Number.isFinite(c.centro.x) && Number.isFinite(c.centro.y)).toBe(true);
    });
    expect(
      publica.casillas.filter((c) => c.terreno === 'DESIERTO').every((c) => c.ficha === null),
    ).toBe(true);
  });

  it('cada vértice trae su posición y sus vecinos; cada arista, sus dos extremos', () => {
    const idsVertices = new Set(publica.vertices.map((v) => v.id));
    for (const v of publica.vertices) {
      expect(v.vecinos.every((id) => idsVertices.has(id))).toBe(true);
    }
    for (const a of publica.aristas) {
      expect(a.vertices.every((id) => idsVertices.has(id))).toBe(true);
    }
  });

  it('cada puerto cuelga de una arista que existe y protege sus dos vértices', () => {
    const aristas = new Map(publica.aristas.map((a) => [a.id, a.vertices]));
    for (const p of publica.puertos) {
      expect(aristas.get(p.arista)).toEqual(p.vertices);
    }
  });

  it('se puede mandar tal cual por la red: JSON sin pérdida, sin funciones ni semillas', () => {
    const json = JSON.stringify(publica);
    expect(JSON.parse(json)).toEqual(publica);
    expect(json).not.toContain(mesa.config.semillaAzar);
    expect(json).not.toContain(mesa.config.semillaMapa);
  });

  it('es determinista y no comparte referencias con la mesa', () => {
    expect(mesaPublica(mesa)).toEqual(publica);
    const original = mesa.tablero.casillas[0]!.terreno;
    (publica.casillas[0] as { terreno: string }).terreno = 'MUTADO';
    expect(mesa.tablero.casillas[0]!.terreno).toBe(original);
  });

  it('con 6 jugadores describe el mapa grande', () => {
    const grande = mesaPublica(mesaDePrueba({ jugadores: 6 }));
    expect(grande.radio).toBe(3);
    expect(grande.casillas).toHaveLength(37);
  });
});
