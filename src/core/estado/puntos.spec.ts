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
});
