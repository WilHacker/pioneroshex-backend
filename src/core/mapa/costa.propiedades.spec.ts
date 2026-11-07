import fc from 'fast-check';
import { casillasPorRadio, clave } from './coordenadas.js';
import { posicionDeVertice } from './geometria.js';
import { costasDelMapa, crearMapaDesdeCasillas, tierraConectada } from './mapa.js';

const BASE = casillasPorRadio(4);

/** Un hexágono de radio 4 al que se le quitan casillas al azar: salen lagos, bahías y huecos. */
const formaAleatoria = fc
  .uniqueArray(fc.integer({ min: 0, max: BASE.length - 1 }), { minLength: 0, maxLength: 25 })
  .map((quitar) => {
    const fuera = new Set(quitar);
    return BASE.filter((_, i) => !fuera.has(i));
  })
  .filter((casillas) => casillas.length > 0)
  .map(crearMapaDesdeCasillas)
  .filter(tierraConectada);

const minY = (aristas: readonly { vertices: readonly [string, string] }[]): number =>
  Math.min(...aristas.flatMap((a) => a.vertices.map((v) => posicionDeVertice(v).y)));

describe('costasDelMapa: propiedades con formas aleatorias', () => {
  it('cada arista costera está en exactamente una costa y las costas son ciclos cerrados', () => {
    fc.assert(
      fc.property(formaAleatoria, (mapa) => {
        const { exterior, interiores } = costasDelMapa(mapa);
        const todas = [exterior, ...interiores].flat();
        const casillasPorVertice = new Map(mapa.vertices.map((v) => [v.id, v.casillas.map(clave)]));
        const costeras = mapa.aristas.filter((a) => {
          const [x, y] = a.vertices.map((v) => casillasPorVertice.get(v) ?? []);
          return x!.filter((c) => y!.includes(c)).length === 1;
        });
        expect(todas).toHaveLength(costeras.length);
        expect(new Set(todas.map((a) => a.id)).size).toBe(costeras.length);
        for (const costa of [exterior, ...interiores]) {
          costa.forEach((arista, i) => {
            const siguiente = costa[(i + 1) % costa.length]!;
            expect(arista.vertices.some((v) => siguiente.vertices.includes(v))).toBe(true);
          });
        }
      }),
      { numRuns: 200 },
    );
  });

  it('hay tantos lagos como agujeros: interiores = 1 − (V − E + F) (característica de Euler)', () => {
    fc.assert(
      fc.property(formaAleatoria, (mapa) => {
        const euler = mapa.vertices.length - mapa.aristas.length + mapa.casillas.length;
        expect(costasDelMapa(mapa).interiores).toHaveLength(1 - euler);
      }),
      { numRuns: 200 },
    );
  });

  it('el exterior es el que llega más al norte: ningún lago toca la fila de arriba', () => {
    fc.assert(
      fc.property(formaAleatoria, (mapa) => {
        const { exterior, interiores } = costasDelMapa(mapa);
        for (const lago of interiores) expect(minY(exterior)).toBeLessThan(minY(lago));
      }),
      { numRuns: 200 },
    );
  });
});
