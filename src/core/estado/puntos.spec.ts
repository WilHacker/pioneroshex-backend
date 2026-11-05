import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { crearPartida } from './crear.js';
import { puntosDe } from './puntos.js';
import { conCambios, mesaDePrueba } from './pruebas.js';

const mesa = mesaDePrueba();
const base = crearPartida(mesa, ['a', 'b', 'c', 'd']);
const [j0, j1] = base.jugadores.map((j) => j.id) as [string, string];
const [v1, v2, v3] = mesa.mapa.vertices.map((v) => v.id) as [string, string, string];

describe('puntosDe', () => {
  it('sin edificios son 0', () => {
    expect(puntosDe(base, j0)).toBe(0);
  });

  it('2 poblados = 2 (los edificios rivales no cuentan)', () => {
    const estado = conCambios(base, {
      edificios: {
        [v1]: { dueno: j0, tipo: 'POBLADO' },
        [v2]: { dueno: j0, tipo: 'POBLADO' },
        [v3]: { dueno: j1, tipo: 'CIUDAD' },
      },
    });
    expect(puntosDe(estado, j0)).toBe(2);
  });

  it('poblado + ciudad = 3', () => {
    const estado = conCambios(base, {
      edificios: { [v1]: { dueno: j0, tipo: 'POBLADO' }, [v2]: { dueno: j0, tipo: 'CIUDAD' } },
    });
    expect(puntosDe(estado, j0)).toBe(3);
  });

  it('suma 2 puntos por Gran Ejército y 2 por Gran Ruta', () => {
    const estado = conCambios(base, {
      edificios: { [v1]: { dueno: j0, tipo: 'POBLADO' } },
      granEjercito: j0,
      granRuta: j0,
    });
    // 1 (poblado) + 2 (ejército) + 2 (ruta) = 5
    expect(puntosDe(estado, j0)).toBe(5);
  });

  it('incluye cartas de punto de victoria ocultas si se solicita', () => {
    const estado = produce(base, (b) => {
      b.edificios[v1] = { dueno: j0, tipo: 'POBLADO' };
      const j = b.jugadores.find((jug) => jug.id === j0)!;
      j.cartasDesarrollo = ['PUNTO_VICTORIA', 'CABALLERO'];
      j.cartasCompradasEsteTurno = ['PUNTO_VICTORIA'];
    });
    expect(puntosDe(estado, j0)).toBe(1);
    expect(puntosDe(estado, j0, { incluirOcultos: true })).toBe(3);
  });
});
