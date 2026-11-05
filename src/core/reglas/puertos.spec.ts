import fc from 'fast-check';
import { aristasCosteras, crearMapa } from '../mapa/mapa.js';
import {
  PUERTOS_CLASICOS,
  generarPuertos,
  tiposDePuertosParaCosta,
  mejorRazon,
  type Puerto,
  type TipoPuerto,
} from './puertos.js';

const mapa = crearMapa(2);
const costa = aristasCosteras(mapa);

function contar<T>(items: readonly T[]): Record<string, number> {
  const cuentas: Record<string, number> = {};
  for (const item of items) cuentas[String(item)] = (cuentas[String(item)] ?? 0) + 1;
  return cuentas;
}

function comparteVertices(puertos: readonly Puerto[]): boolean {
  const vertices = puertos.flatMap((p) => p.vertices);
  return new Set(vertices).size !== vertices.length;
}

describe('generarPuertos (clásico)', () => {
  const puertos = generarPuertos(mapa, 'ANDES-2026');

  it('crea 9 puertos: 4 genéricos y uno por cada recurso', () => {
    expect(puertos).toHaveLength(9);
    expect(contar(puertos.map((p) => p.tipo))).toEqual({
      GENERICO: 4,
      MADERA: 1,
      LADRILLO: 1,
      OVEJA: 1,
      TRIGO: 1,
      MINERAL: 1,
    });
  });

  it('cada puerto está sobre una arista costera distinta, con sus dos vértices', () => {
    const idsCosta = new Map(costa.map((a) => [a.id, a]));
    expect(new Set(puertos.map((p) => p.arista)).size).toBe(9);
    for (const p of puertos) {
      expect(idsCosta.get(p.arista)?.vertices).toEqual(p.vertices);
    }
  });

  it('ningún vértice pertenece a dos puertos', () => {
    expect(comparteVertices(puertos)).toBe(false);
  });

  it('se reparten parejos por la costa: separación de 3 o 4 aristas', () => {
    const indices = puertos.map((p) => costa.findIndex((a) => a.id === p.arista));
    indices.forEach((indice, i) => {
      const siguiente = indices[(i + 1) % indices.length];
      const separacion = (siguiente - indice + costa.length) % costa.length;
      expect([3, 4]).toContain(separacion);
    });
  });
});

describe('generarPuertos (semilla y opciones)', () => {
  it('la misma semilla da los mismos puertos', () => {
    expect(generarPuertos(mapa, 'ANDES-2026')).toEqual(generarPuertos(mapa, 'ANDES-2026'));
  });

  it('semillas distintas reparten los tipos de otra forma', () => {
    expect(generarPuertos(mapa, 'ANDES-2026')).not.toEqual(generarPuertos(mapa, 'CARIBE-2026'));
  });

  it('acepta una lista de tipos propia', () => {
    const tipos: TipoPuerto[] = ['GENERICO', 'TRIGO'];
    const puertos = generarPuertos(mapa, 's', tipos);
    expect(puertos).toHaveLength(2);
    expect(puertos.map((p) => p.tipo).toSorted()).toEqual(['GENERICO', 'TRIGO']);
  });

  it('sin tipos no hay puertos', () => {
    expect(generarPuertos(mapa, 's', [])).toEqual([]);
  });

  it('no muta la lista de tipos recibida', () => {
    const tipos = [...PUERTOS_CLASICOS];
    generarPuertos(mapa, 's', tipos);
    expect(tipos).toEqual(PUERTOS_CLASICOS);
  });

  it('rechaza más puertos de los que caben (hace falta al menos 2 aristas por puerto)', () => {
    expect(() => generarPuertos(crearMapa(0), 's', PUERTOS_CLASICOS)).toThrow(/puertos/i);
  });

  it('propiedad: en cualquier mapa donde caben, los puertos van en la costa y sin vértices compartidos', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 6 }), fc.string(), (R, semilla) => {
        const m = crearMapa(R);
        const idsCosta = new Set(aristasCosteras(m).map((a) => a.id));
        const puertos = generarPuertos(m, semilla);
        return (
          puertos.length === tiposDePuertosParaCosta(idsCosta.size).length &&
          puertos.every((p) => idsCosta.has(p.arista)) &&
          !comparteVertices(puertos)
        );
      }),
      { numRuns: 100 },
    );
  });
});

describe('mejorRazon', () => {
  const puertos: Puerto[] = [
    { arista: 'a1', vertices: ['v1', 'v2'], tipo: 'GENERICO' },
    { arista: 'a2', vertices: ['v3', 'v4'], tipo: 'TRIGO' },
  ];

  it('sin puerto el cambio con la banca es 4:1', () => {
    expect(mejorRazon(puertos, new Set(), 'TRIGO')).toBe(4);
    expect(mejorRazon(puertos, new Set(['otro']), 'TRIGO')).toBe(4);
  });

  it('un puerto genérico da 3:1 para cualquier recurso, desde cualquiera de sus dos vértices', () => {
    expect(mejorRazon(puertos, new Set(['v1']), 'MADERA')).toBe(3);
    expect(mejorRazon(puertos, new Set(['v2']), 'MINERAL')).toBe(3);
  });

  it('un puerto de recurso da 2:1 solo para ese recurso', () => {
    expect(mejorRazon(puertos, new Set(['v3']), 'TRIGO')).toBe(2);
    expect(mejorRazon(puertos, new Set(['v4']), 'MADERA')).toBe(4);
  });

  it('con ambos puertos se queda con la mejor razón para cada recurso', () => {
    const propios = new Set(['v1', 'v3']);
    expect(mejorRazon(puertos, propios, 'TRIGO')).toBe(2);
    expect(mejorRazon(puertos, propios, 'MADERA')).toBe(3);
  });
});
