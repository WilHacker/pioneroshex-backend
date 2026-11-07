import { casillasPorRadio, clave, hex } from './coordenadas.js';
import {
  aristasCosteras,
  costasDelMapa,
  crearMapa,
  crearMapaDesdeCasillas,
  tierraConectada,
} from './mapa.js';

const sin = (radio: number, quitar: readonly [number, number][]) =>
  casillasPorRadio(radio).filter((c) => !quitar.some(([q, r]) => c.q === q && c.r === r));

const ANILLO = sin(1, [[0, 0]]); // 6 casillas alrededor de un lago de 1 casilla
const RADIO3_UN_LAGO = sin(3, [
  [0, 0],
  ...casillasPorRadio(1).map((c): [number, number] => [c.q, c.r]),
]); // lago de 7 casillas
const RADIO3_DOS_LAGOS = sin(3, [
  [-1, 1],
  [1, -1],
]); // dos lagos de 1 casilla que no se tocan

describe('costasDelMapa', () => {
  it.each([0, 1, 2, 3, 4])('en el hexágono de radio %i solo hay costa exterior (12R+6)', (R) => {
    const { exterior, interiores } = costasDelMapa(crearMapa(R));
    expect(exterior).toHaveLength(12 * R + 6);
    expect(interiores).toEqual([]);
  });

  it('un anillo de 6 casillas tiene 18 aristas de costa exterior y 6 de un lago', () => {
    const { exterior, interiores } = costasDelMapa(crearMapaDesdeCasillas(ANILLO));
    expect(exterior).toHaveLength(18);
    expect(interiores.map((c) => c.length)).toEqual([6]);
  });

  it('un lago de 7 casillas dentro del radio 3: 42 exteriores y 18 del lago', () => {
    const { exterior, interiores } = costasDelMapa(crearMapaDesdeCasillas(RADIO3_UN_LAGO));
    expect(exterior).toHaveLength(42);
    expect(interiores.map((c) => c.length)).toEqual([18]);
  });

  it('dos lagos separados dan dos costas interiores', () => {
    const { exterior, interiores } = costasDelMapa(crearMapaDesdeCasillas(RADIO3_DOS_LAGOS));
    expect(exterior).toHaveLength(42);
    expect(interiores.map((c) => c.length)).toEqual([6, 6]);
  });

  it('cada costa es un ciclo cerrado: consecutivas comparten un vértice y la última cierra', () => {
    const { exterior, interiores } = costasDelMapa(crearMapaDesdeCasillas(RADIO3_DOS_LAGOS));
    for (const costa of [exterior, ...interiores]) {
      costa.forEach((arista, i) => {
        const siguiente = costa[(i + 1) % costa.length]!;
        expect(arista.vertices.some((v) => siguiente.vertices.includes(v))).toBe(true);
      });
      expect(new Set(costa.map((a) => a.id)).size).toBe(costa.length);
    }
  });

  it('exterior e interiores no comparten aristas ni vértices', () => {
    const { exterior, interiores } = costasDelMapa(crearMapaDesdeCasillas(RADIO3_UN_LAGO));
    const verticesExterior = new Set(exterior.flatMap((a) => a.vertices));
    for (const a of interiores.flat()) {
      expect(a.vertices.some((v) => verticesExterior.has(v))).toBe(false);
    }
  });

  it('aristasCosteras devuelve la costa exterior (los lagos no cuentan)', () => {
    const mapa = crearMapaDesdeCasillas(RADIO3_UN_LAGO);
    expect(aristasCosteras(mapa)).toEqual(costasDelMapa(mapa).exterior);
  });

  it('el hexágono clásico conserva el orden de siempre (empieza en la primera arista costera)', () => {
    const mapa = crearMapa(2);
    const primera = mapa.aristas.find((a) =>
      costasDelMapa(mapa).exterior.some((e) => e.id === a.id),
    );
    expect(aristasCosteras(mapa)[0]).toEqual(primera);
  });

  it('rechaza una tierra partida en dos trozos', () => {
    const mapa = crearMapaDesdeCasillas([hex(0, 0), hex(3, 0)]);
    expect(() => costasDelMapa(mapa)).toThrow(/conectada/);
  });

  it('sigue detectando un borde roto', () => {
    const mapa = crearMapa(2);
    const rota = {
      ...mapa,
      aristas: mapa.aristas.filter((a) => a.id !== aristasCosteras(mapa)[3]!.id),
    };
    expect(() => aristasCosteras(rota)).toThrow(/ciclo cerrado/);
  });
});

describe('tierraConectada', () => {
  it('es verdadera para hexágonos, formas con lagos y una sola casilla', () => {
    expect(tierraConectada(crearMapa(3))).toBe(true);
    expect(tierraConectada(crearMapaDesdeCasillas(ANILLO))).toBe(true);
    expect(tierraConectada(crearMapaDesdeCasillas(RADIO3_DOS_LAGOS))).toBe(true);
    expect(tierraConectada(crearMapaDesdeCasillas([hex(0, 0)]))).toBe(true);
  });

  it('es falsa si hay casillas que no se tocan', () => {
    expect(tierraConectada(crearMapaDesdeCasillas([hex(0, 0), hex(2, 0)]))).toBe(false);
  });

  it('dos casillas que solo se tocan en una esquina (no vecinas) no cuentan como unidas', () => {
    // (1,0) y (0,1) son vecinas; (1,1) está a distancia 2 de (0,0).
    expect(clave(hex(1, 1))).toBe('1,1');
    expect(tierraConectada(crearMapaDesdeCasillas([hex(0, 0), hex(1, 1)]))).toBe(false);
  });
});
