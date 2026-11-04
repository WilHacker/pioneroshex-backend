import fc from 'fast-check';
import { clave, distancia } from '../mapa/coordenadas.js';
import { crearMapa } from '../mapa/mapa.js';
import {
  DISTRIBUCION_CLASICA,
  generarTablero,
  type Distribucion,
  type Tablero,
} from './tablero.js';

const mapa = crearMapa(2);

function contar<T>(items: readonly T[]): Map<T, number> {
  const cuentas = new Map<T, number>();
  for (const item of items) cuentas.set(item, (cuentas.get(item) ?? 0) + 1);
  return cuentas;
}

function fichasCalientesJuntas(tablero: Tablero): boolean {
  const calientes = tablero.casillas.filter((c) => c.ficha === 6 || c.ficha === 8);
  return calientes.some((a) => calientes.some((b) => distancia(a.hex, b.hex) === 1));
}

describe('generarTablero (distribución clásica)', () => {
  const tablero = generarTablero(mapa, 'ANDES-2026');

  it('asigna un terreno a cada casilla del mapa, en el mismo orden', () => {
    expect(tablero.casillas.map((c) => clave(c.hex))).toEqual(mapa.casillas.map(clave));
  });

  it('reparte 4 bosques, 4 pastos, 4 campos, 3 colinas, 3 montañas y 1 desierto', () => {
    const cuentas = contar(tablero.casillas.map((c) => c.terreno));
    expect(Object.fromEntries(cuentas)).toEqual({
      BOSQUE: 4,
      PASTO: 4,
      CAMPO: 4,
      COLINA: 3,
      MONTANA: 3,
      DESIERTO: 1,
    });
  });

  it('reparte las 18 fichas del 2 al 12 sin el 7', () => {
    const fichas = tablero.casillas.flatMap((c) => (c.ficha === null ? [] : [c.ficha]));
    expect(fichas.toSorted((a, b) => a - b)).toEqual([
      2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
    ]);
  });

  it('el desierto no tiene ficha y es donde empieza el ladrón', () => {
    const desierto = tablero.casillas.find((c) => c.terreno === 'DESIERTO');
    expect(desierto?.ficha).toBeNull();
    expect(tablero.ladron).toEqual(desierto?.hex);
  });

  it('las casillas productivas siempre tienen ficha', () => {
    for (const c of tablero.casillas) {
      expect(c.ficha === null).toBe(c.terreno === 'DESIERTO');
    }
  });
});

describe('generarTablero (semilla)', () => {
  it('la misma semilla da exactamente el mismo tablero', () => {
    expect(generarTablero(mapa, 'ANDES-2026')).toEqual(generarTablero(mapa, 'ANDES-2026'));
  });

  it('semillas distintas dan tableros distintos', () => {
    expect(generarTablero(mapa, 'ANDES-2026')).not.toEqual(generarTablero(mapa, 'CARIBE-2026'));
  });

  it('propiedad: con cualquier semilla, el 6 y el 8 nunca quedan adyacentes', () => {
    fc.assert(
      fc.property(fc.string(), (semilla) => !fichasCalientesJuntas(generarTablero(mapa, semilla))),
      { numRuns: 300 },
    );
  });

  it('propiedad: con cualquier semilla se conserva la distribución', () => {
    fc.assert(
      fc.property(fc.string(), (semilla) => {
        const t = generarTablero(mapa, semilla);
        const terrenos = contar(t.casillas.map((c) => c.terreno));
        return (
          terrenos.get('DESIERTO') === 1 && terrenos.get('BOSQUE') === 4 && t.casillas.length === 19
        );
      }),
      { numRuns: 100 },
    );
  });

  it('no muta la distribución recibida', () => {
    const copia = JSON.parse(JSON.stringify(DISTRIBUCION_CLASICA));
    generarTablero(mapa, 'x');
    expect(JSON.parse(JSON.stringify(DISTRIBUCION_CLASICA))).toEqual(copia);
  });
});

describe('generarTablero (otras distribuciones)', () => {
  const mapaChico = crearMapa(1); // 7 casillas: un centro y un anillo de 6

  it('acepta una distribución propia para otro tamaño de mapa', () => {
    const distribucion: Distribucion = {
      terrenos: { BOSQUE: 2, PASTO: 2, CAMPO: 2, COLINA: 0, MONTANA: 0, DESIERTO: 1 },
      fichas: [2, 3, 4, 5, 9, 10],
    };
    const t = generarTablero(mapaChico, 'mini', distribucion);
    expect(t.casillas).toHaveLength(7);
    expect(contar(t.casillas.map((c) => c.terreno)).get('DESIERTO')).toBe(1);
  });

  it('un mapa sin desierto no tiene ladrón inicial', () => {
    const distribucion: Distribucion = {
      terrenos: { BOSQUE: 7, PASTO: 0, CAMPO: 0, COLINA: 0, MONTANA: 0, DESIERTO: 0 },
      fichas: [2, 3, 4, 5, 9, 10, 11],
    };
    expect(generarTablero(mapaChico, 'sin-desierto', distribucion).ladron).toBeNull();
  });

  it('rechaza una distribución cuyos terrenos no suman las casillas del mapa', () => {
    expect(() => generarTablero(mapaChico, 's', DISTRIBUCION_CLASICA)).toThrow(/terrenos/i);
  });

  it('rechaza una distribución cuyas fichas no coinciden con las casillas productivas', () => {
    const distribucion: Distribucion = {
      terrenos: { BOSQUE: 2, PASTO: 2, CAMPO: 2, COLINA: 0, MONTANA: 0, DESIERTO: 1 },
      fichas: [2, 3, 4],
    };
    expect(() => generarTablero(mapaChico, 's', distribucion)).toThrow(/fichas/i);
  });

  it('falla con un mensaje claro si es imposible separar el 6 y el 8', () => {
    // Anillo de 6 casillas con solo 6 y 8: todas son calientes y cada una toca a otra.
    const distribucion: Distribucion = {
      terrenos: { BOSQUE: 6, PASTO: 0, CAMPO: 0, COLINA: 0, MONTANA: 0, DESIERTO: 1 },
      fichas: [6, 8, 6, 8, 6, 8],
    };
    expect(() => generarTablero(mapaChico, 's', distribucion)).toThrow(/6 y el 8/);
  });
});
