import fc from 'fast-check';
import { casillasPorRadio, distancia } from '../mapa/coordenadas.js';
import { aristasCosteras, crearMapa } from '../mapa/mapa.js';
import { RECURSOS } from './recursos.js';
import {
  DISTRIBUCION_CLASICA,
  distribucionParaCasillas,
  generarTablero,
  type Terreno,
} from './tablero.js';
import { PUERTOS_CLASICOS, generarPuertos, tiposDePuertosParaCosta } from './puertos.js';

const RADIOS = [0, 1, 2, 3, 4, 5];

function contar<T>(items: readonly T[]): Map<T, number> {
  const cuentas = new Map<T, number>();
  for (const item of items) cuentas.set(item, (cuentas.get(item) ?? 0) + 1);
  return cuentas;
}

describe('distribucionParaCasillas', () => {
  it('con 19 casillas (radio 2) es exactamente la distribución clásica', () => {
    expect(distribucionParaCasillas(19)).toEqual(DISTRIBUCION_CLASICA);
  });

  it.each(RADIOS)(
    'radio %i: los terrenos suman las casillas y hay una ficha por productiva',
    (radio) => {
      const n = casillasPorRadio(radio).length;
      const d = distribucionParaCasillas(n);
      const total = Object.values(d.terrenos).reduce((a, b) => a + b, 0);
      expect(total).toBe(n);
      expect(d.fichas).toHaveLength(n - d.terrenos.DESIERTO);
    },
  );

  it.each([
    [1, 1],
    [7, 1],
    [19, 1],
    [37, 2],
    [61, 3],
    [91, 5],
  ])('con %i casillas hay %i desiertos', (casillas, desiertos) => {
    expect(distribucionParaCasillas(casillas).terrenos.DESIERTO).toBe(desiertos);
  });

  it.each(RADIOS.filter((r) => r >= 1))(
    'radio %i: ningún recurso falta y cada uno queda a menos de 1 de su cuota exacta',
    (radio) => {
      const { terrenos, fichas } = distribucionParaCasillas(casillasPorRadio(radio).length);
      const pesos: [Terreno, number][] = [
        ['BOSQUE', 4],
        ['PASTO', 4],
        ['CAMPO', 4],
        ['COLINA', 3],
        ['MONTANA', 3],
      ];
      for (const [terreno, peso] of pesos) {
        expect(terrenos[terreno]).toBeGreaterThanOrEqual(1);
        expect(Math.abs(terrenos[terreno] - (fichas.length * peso) / 18)).toBeLessThan(1);
      }
    },
  );

  it.each(RADIOS)('radio %i: las fichas van del 2 al 12 sin el 7', (radio) => {
    const { fichas } = distribucionParaCasillas(casillasPorRadio(radio).length);
    expect(fichas.every((f) => f >= 2 && f <= 12 && f !== 7)).toBe(true);
  });

  it('radio 3: el 6 y el 8 salen 4 veces cada uno y el 2 y el 12 se reparten 2 y 1', () => {
    const cuentas = contar(distribucionParaCasillas(37).fichas);
    expect(cuentas.get(6)).toBe(4);
    expect(cuentas.get(8)).toBe(4);
    expect((cuentas.get(2) ?? 0) + (cuentas.get(12) ?? 0)).toBe(3);
  });

  it('crece de forma monótona: con más casillas ninguna ficha aparece menos veces', () => {
    for (let n = 19; n < 100; n++) {
      const a = contar(distribucionParaCasillas(n).fichas);
      const b = contar(distribucionParaCasillas(n + 1).fichas);
      for (const [ficha, veces] of a) expect(b.get(ficha) ?? 0).toBeGreaterThanOrEqual(veces);
    }
  });

  it('no devuelve estructuras compartidas: modificar un resultado no altera el siguiente', () => {
    const primero = distribucionParaCasillas(37);
    (primero.fichas as number[]).push(99);
    expect(distribucionParaCasillas(37).fichas).not.toContain(99);
  });

  it.each([0, -1, 2.5, Number.NaN])('rechaza %s casillas', (casillas) => {
    expect(() => distribucionParaCasillas(casillas)).toThrow(/casillas/);
  });
});

describe('generarTablero en mapas de otros tamaños (distribución por defecto)', () => {
  it.each([1, 3, 4])('radio %i: reparte todo y respeta que el 6 y el 8 no se toquen', (radio) => {
    const mapa = crearMapa(radio);
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), (semilla) => {
        const tablero = generarTablero(mapa, semilla);
        const calientes = tablero.casillas.filter((c) => c.ficha === 6 || c.ficha === 8);
        const juntas = calientes.some((a, i) =>
          calientes.slice(i + 1).some((b) => distancia(a.hex, b.hex) === 1),
        );
        expect(juntas).toBe(false);
        expect(tablero.casillas).toHaveLength(mapa.casillas.length);
      }),
      { numRuns: 50 },
    );
  });

  it('radio 3: dos desiertos y el ladrón empieza en el primero', () => {
    const tablero = generarTablero(crearMapa(3), 'ANDES-2026');
    const desiertos = tablero.casillas.filter((c) => c.terreno === 'DESIERTO');
    expect(desiertos).toHaveLength(2);
    expect(tablero.ladron).toEqual(desiertos[0].hex);
  });

  it('en el mapa clásico no cambia nada respecto a antes (mismo tablero para la misma semilla)', () => {
    const mapa = crearMapa(2);
    expect(generarTablero(mapa, 'ANDES-2026')).toEqual(
      generarTablero(mapa, 'ANDES-2026', DISTRIBUCION_CLASICA),
    );
  });
});

describe('tiposDePuertosParaCosta', () => {
  it('con la costa del mapa clásico (30 aristas) es el reparto clásico', () => {
    expect(tiposDePuertosParaCosta(30).toSorted()).toEqual(PUERTOS_CLASICOS.toSorted());
  });

  it.each([
    [1, 18, 5],
    [3, 42, 13],
    [4, 54, 16],
    [5, 66, 20],
  ])('radio %i (%i aristas de costa): %i puertos', (_radio, costa, esperados) => {
    expect(tiposDePuertosParaCosta(costa)).toHaveLength(esperados);
  });

  it.each([18, 42, 54, 66])(
    'con %i aristas hay el mismo número de puertos por recurso',
    (costa) => {
      const cuentas = contar(tiposDePuertosParaCosta(costa));
      const porRecurso = RECURSOS.map((r) => cuentas.get(r));
      expect(new Set(porRecurso).size).toBe(1);
      expect(porRecurso[0]).toBeGreaterThanOrEqual(1);
    },
  );

  it('una costa demasiado pequeña para un juego completo de puertos no lleva ninguno', () => {
    expect(tiposDePuertosParaCosta(6)).toEqual([]);
  });

  it('siempre caben: hace falta 1 puerto por cada 2 aristas como máximo', () => {
    for (let costa = 6; costa <= 120; costa += 6) {
      expect(tiposDePuertosParaCosta(costa).length * 2).toBeLessThanOrEqual(costa);
    }
  });

  it.each([-1, 2.5, Number.NaN])('rechaza %s aristas', (costa) => {
    expect(() => tiposDePuertosParaCosta(costa)).toThrow(/costa/);
  });
});

describe('generarPuertos en mapas de otros tamaños (tipos por defecto)', () => {
  it.each([1, 3, 4, 5])(
    'radio %i: los puertos caben, van en la costa y no comparten vértices',
    (radio) => {
      const mapa = crearMapa(radio);
      const costa = new Set(aristasCosteras(mapa).map((a) => a.id));
      const puertos = generarPuertos(mapa, 'ANDES-2026');
      expect(puertos.length).toBeGreaterThan(0);
      expect(puertos.every((p) => costa.has(p.arista))).toBe(true);
      const vertices = puertos.flatMap((p) => p.vertices);
      expect(new Set(vertices).size).toBe(vertices.length);
    },
  );

  it('radio 3: 13 puertos', () => {
    expect(generarPuertos(crearMapa(3), 'X')).toHaveLength(13);
  });

  it('un mapa sin espacio para un juego completo no lleva puertos', () => {
    expect(generarPuertos(crearMapa(0), 'X')).toEqual([]);
  });

  it('en el mapa clásico sigue dando los mismos puertos que antes', () => {
    const mapa = crearMapa(2);
    expect(generarPuertos(mapa, 'ANDES-2026')).toEqual(
      generarPuertos(mapa, 'ANDES-2026', PUERTOS_CLASICOS),
    );
  });
});
