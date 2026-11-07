import { crearMesa } from '../estado/mesa.js';
import { crearMapa, crearMapaDesdeCasillas } from '../mapa/mapa.js';
import { crearGameConfig } from '../partida/game-config.js';
import {
  aMapaConfig,
  CATALOGO,
  infoDelMapa,
  mapaDelCatalogo,
  problemasDelMapa,
} from './catalogo.js';

const IDS_ESPERADOS = [
  'bosque-negro',
  'clasico',
  'diamante',
  'eeuu',
  'engranaje',
  'estanque',
  'fiebre-del-oro',
  'gigante',
  'grande',
  'lagos',
  'lucha',
  'reino-unido',
  'remolino',
  'tierra',
  'volcan',
];

const semillas = { semillaMapa: 'CATALOGO-MAPA', semillaAzar: '#catalogo-azar' };

const claves = (casillas: readonly { q: number; r: number }[]) =>
  casillas.map((c) => `${c.q},${c.r}`).toSorted();

describe('CATALOGO', () => {
  it('tiene los mapas pedidos, con ids únicos en minúsculas y guiones', () => {
    const ids = CATALOGO.map((m) => m.id);
    expect(ids.toSorted()).toEqual(IDS_ESPERADOS);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[a-z]+(-[a-z]+)*$/.test(id))).toBe(true);
  });

  it('es de solo lectura', () => {
    expect(Object.isFrozen(CATALOGO)).toBe(true);
  });

  it('el clásico, el grande y el gigante son los hexágonos de radio 2, 3 y 4', () => {
    for (const [id, radio] of [
      ['clasico', 2],
      ['grande', 3],
      ['gigante', 4],
    ] as const) {
      const entrada = mapaDelCatalogo(id)!;
      const hexagono = crearMapa(radio);
      const mapa = crearMapaDesdeCasillas(
        entrada.casillas.map(([q, r]) => ({ q, r, s: 0 - q - r })),
      );
      // Las mismas casillas (no solo la misma cantidad), y por tanto los mismos vértices y aristas.
      expect(claves(mapa.casillas)).toEqual(claves(hexagono.casillas));
      expect(mapa.vertices.map((v) => v.id).toSorted()).toEqual(
        hexagono.vertices.map((v) => v.id).toSorted(),
      );
    }
  });

  describe.each(CATALOGO.map((m) => [m.id, m] as const))('mapa «%s»', (_id, entrada) => {
    it('tiene nombre y descripción', () => {
      expect(entrada.nombre.trim()).not.toBe('');
      expect(entrada.descripcion.trim()).not.toBe('');
    });

    it('no tiene problemas (tierra conectada, tablero, puertos y espacio para jugar)', () => {
      expect(problemasDelMapa(entrada)).toEqual([]);
    });

    it('sirve para jugar de verdad: su rango recomendado no está vacío', () => {
      const info = infoDelMapa(entrada);
      expect(info.maximoRecomendado).toBeGreaterThanOrEqual(2);
      expect(info.minimoRecomendado).toBeLessThanOrEqual(info.maximoRecomendado);
    });

    it('crea la mesa con el mínimo y el máximo recomendados, con puertos', () => {
      const info = infoDelMapa(entrada);
      for (const jugadores of [info.minimoRecomendado, info.maximoRecomendado]) {
        const config = crearGameConfig({ ...semillas, jugadores, mapa: aMapaConfig(entrada) });
        const mesa = crearMesa(config);
        expect(mesa.mapa.casillas).toHaveLength(entrada.casillas.length);
        expect(mesa.puertos.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('mapaDelCatalogo', () => {
  it('busca por id', () => {
    expect(mapaDelCatalogo('lagos')?.nombre).toBe('Lagos');
  });

  it('no encuentra ids desconocidos ni nombres heredados del prototipo', () => {
    expect(mapaDelCatalogo('no-existe')).toBeUndefined();
    expect(mapaDelCatalogo('constructor')).toBeUndefined();
    expect(mapaDelCatalogo('__proto__')).toBeUndefined();
  });
});

describe('infoDelMapa', () => {
  it('cuenta casillas y vértices y da los máximos', () => {
    const info = infoDelMapa(mapaDelCatalogo('clasico')!);
    expect(info).toMatchObject({ id: 'clasico', casillas: 19, vertices: 54, maximoRecomendado: 4 });
    expect(info.maximoTecnico).toBe(7);
  });
});

describe('problemasDelMapa', () => {
  const base = { id: 'x', nombre: 'X', descripcion: 'X' };

  it('detecta tierra partida en dos', () => {
    const problemas = problemasDelMapa({
      ...base,
      casillas: [
        [0, 0],
        [5, 0],
      ],
    });
    expect(problemas.join(' ')).toMatch(/conectada/);
  });

  it('detecta un mapa demasiado pequeño para jugar', () => {
    const problemas = problemasDelMapa({
      ...base,
      casillas: [
        [0, 0],
        [1, 0],
      ],
    });
    expect(problemas.length).toBeGreaterThan(0);
  });

  it('detecta casillas repetidas', () => {
    const problemas = problemasDelMapa({
      ...base,
      casillas: [
        [0, 0],
        [0, 0],
      ],
    });
    expect(problemas.join(' ')).toMatch(/repetid/);
  });
});
