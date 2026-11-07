import { casillasPorRadio } from '../mapa/coordenadas.js';
import { crearGameConfig, type MapaConfig } from '../partida/game-config.js';
import { mesaPublica } from './mesa-publica.js';
import { crearMesa } from './mesa.js';

const BASE = { semillaMapa: 'MAPA-PRUEBA', semillaAzar: '#secreta-de-prueba' };

const comoPares = (radio: number): MapaConfig['casillas'] =>
  casillasPorRadio(radio).map((c) => [c.q, c.r] as const);

describe('crearMesa con config.mapa', () => {
  it('con las casillas del radio 2 da la misma mesa que con radio 2', () => {
    const porRadio = crearMesa(crearGameConfig({ ...BASE, jugadores: 4 }));
    const porMapa = crearMesa(
      crearGameConfig({
        ...BASE,
        jugadores: 4,
        mapa: { nombre: 'Clásico', casillas: comoPares(2) },
      }),
    );
    expect(porMapa.mapa).toEqual(porRadio.mapa);
    expect(porMapa.tablero).toEqual(porRadio.tablero);
    expect(porMapa.puertos).toEqual(porRadio.puertos);
  });

  it('un rombo de 4x4 (16 casillas) genera tablero, puertos y mesa pública', () => {
    const casillas: [number, number][] = [];
    for (let q = 0; q < 4; q++) for (let r = 0; r < 4; r++) casillas.push([q, r]);
    const config = crearGameConfig({ ...BASE, jugadores: 3, mapa: { nombre: 'Rombo', casillas } });
    const mesa = crearMesa(config);

    expect(mesa.mapa.casillas).toHaveLength(16);
    expect(mesa.tablero.casillas).toHaveLength(16);
    expect(mesa.puertos.length).toBeGreaterThan(0);
    const publica = mesaPublica(mesa);
    expect(publica.casillas).toHaveLength(16);
    expect(publica.radio).toBe(mesa.mapa.radio);
  });

  it('es determinista: misma config, misma mesa', () => {
    const config = crearGameConfig({
      ...BASE,
      jugadores: 6,
      mapa: { nombre: 'Radio 3', casillas: comoPares(3) },
    });
    expect(crearMesa(config).tablero).toEqual(crearMesa(config).tablero);
  });

  it('el 6 y el 8 no quedan juntos en un mapa propio', () => {
    const config = crearGameConfig({
      ...BASE,
      jugadores: 6,
      mapa: { nombre: 'Radio 3', casillas: comoPares(3) },
    });
    const { tablero, mapa } = crearMesa(config);
    const calientes = tablero.casillas.filter((c) => c.ficha === 6 || c.ficha === 8);
    for (const a of calientes) {
      for (const b of calientes) {
        if (a === b) continue;
        const cercanas = mapa.vertices.some(
          (v) =>
            v.casillas.some((x) => x.q === a.hex.q && x.r === a.hex.r) &&
            v.casillas.some((x) => x.q === b.hex.q && x.r === b.hex.r),
        );
        expect(cercanas).toBe(false);
      }
    }
  });
});
