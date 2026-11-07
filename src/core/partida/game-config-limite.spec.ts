import { MAPA_CASILLAS_MAX, crearGameConfig, type MapaConfig } from './game-config.js';

const BASE = { semillaMapa: 'MAPA-LIMITE', semillaAzar: '#azar-limite', jugadores: 2 };

/** Un paralelogramo de `lado` × `lado` casillas, más `extra` casillas en una hilera pegada. */
function rombo(lado: number, extra = 0): MapaConfig {
  const casillas: [number, number][] = [];
  for (let q = 0; q < lado; q++) for (let r = 0; r < lado; r++) casillas.push([q, r]);
  for (let i = 0; i < extra; i++) casillas.push([lado + i, 0]);
  return { nombre: 'Rombo', casillas };
}

describe('tamaño máximo de un mapa propio', () => {
  it('el tope es de 400 casillas (el mapa Tierra del catálogo tiene 94)', () => {
    expect(MAPA_CASILLAS_MAX).toBe(400);
  });

  it('acepta un mapa justo en el tope', () => {
    expect(() => crearGameConfig({ ...BASE, mapa: rombo(20) })).not.toThrow();
  });

  it('rechaza un mapa con una casilla de más, sin construirlo entero', () => {
    expect(() => crearGameConfig({ ...BASE, mapa: rombo(20, 1) })).toThrow(/máximo 400 casillas/);
  });
});
