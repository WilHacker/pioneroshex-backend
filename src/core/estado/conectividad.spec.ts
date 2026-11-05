import { describe, expect, it } from 'vitest';
import { puedeColocarCamino, puedeColocarPoblado } from './conectividad.js';
import { crearPartida } from './crear.js';
import { aristaEntre, conCambios, mesaDePrueba } from './pruebas.js';
import type { Edificio } from './tipos.js';

const mesa = mesaDePrueba();
const base = crearPartida(mesa, ['a', 'b', 'c', 'd']);

// Cadena: c0 - c (centro, 3 vecinos) - n0 - x, con x otro vecino de n0 distinto de c.
const centro = mesa.mapa.vertices.find(
  (v) =>
    v.vecinos.length === 3 && v.vecinos.every((n) => (mesa.vertice(n)?.vecinos.length ?? 0) >= 2),
)!;
const [n0, n1] = centro.vecinos as [string, string, string];
const x = mesa.vertice(n0)!.vecinos.find((v) => v !== centro.id)!;
const aristaCentroN0 = aristaEntre(mesa, centro.id, n0);
const aristaCentroN1 = aristaEntre(mesa, centro.id, n1);
const aristaN0X = aristaEntre(mesa, n0, x);

const poblado = (dueno: string): Edificio => ({ dueno, tipo: 'POBLADO' });
const con = (edificios: Record<string, Edificio>, caminos: Record<string, string>) =>
  conCambios(base, { edificios, caminos });

describe('puedeColocarPoblado', () => {
  const conCamino = { requiereCamino: true };

  it('rechaza un vértice inventado', () => {
    expect(puedeColocarPoblado(mesa, base, 'a', 'no-existe', conCamino)).toEqual({
      ok: false,
      motivo: 'VERTICE_INEXISTENTE',
    });
  });

  it('rechaza un vértice ocupado', () => {
    const estado = con({ [n0]: poblado('b') }, {});
    expect(puedeColocarPoblado(mesa, estado, 'a', n0, conCamino)).toMatchObject({
      motivo: 'VERTICE_OCUPADO',
      detalle: { dueno: 'b' },
    });
  });

  it('rechaza un vértice con un vecino ocupado y dice cuál y de quién', () => {
    const estado = con({ [centro.id]: poblado('b') }, {});
    expect(puedeColocarPoblado(mesa, estado, 'a', n0, conCamino)).toMatchObject({
      motivo: 'DEMASIADO_CERCA',
      detalle: { vecinoOcupado: centro.id, dueno: 'b' },
    });
  });

  it('exige un camino propio cuando requiereCamino es true', () => {
    expect(puedeColocarPoblado(mesa, base, 'a', n0, conCamino)).toEqual({
      ok: false,
      motivo: 'SIN_CONEXION',
    });
  });

  it('no cuenta el camino de otro jugador', () => {
    const estado = con({}, { [aristaCentroN0]: 'b' });
    expect(puedeColocarPoblado(mesa, estado, 'a', n0, conCamino)).toMatchObject({
      motivo: 'SIN_CONEXION',
    });
  });

  it('acepta con un camino propio que toca el vértice', () => {
    const estado = con({}, { [aristaCentroN0]: 'a' });
    expect(puedeColocarPoblado(mesa, estado, 'a', n0, conCamino)).toEqual({ ok: true });
  });

  it('acepta sin camino cuando requiereCamino es false', () => {
    expect(puedeColocarPoblado(mesa, base, 'a', n0, { requiereCamino: false })).toEqual({
      ok: true,
    });
  });
});

describe('puedeColocarCamino', () => {
  it('rechaza una arista inventada', () => {
    expect(puedeColocarCamino(mesa, base, 'a', 'no-existe')).toEqual({
      ok: false,
      motivo: 'ARISTA_INEXISTENTE',
    });
  });

  it('rechaza una arista ocupada', () => {
    const estado = con({}, { [aristaCentroN0]: 'b' });
    expect(puedeColocarCamino(mesa, estado, 'a', aristaCentroN0)).toMatchObject({
      motivo: 'ARISTA_OCUPADA',
      detalle: { dueno: 'b' },
    });
  });

  it('acepta junto a un edificio propio', () => {
    const estado = con({ [centro.id]: poblado('a') }, {});
    expect(puedeColocarCamino(mesa, estado, 'a', aristaCentroN1)).toEqual({ ok: true });
  });

  it('acepta junto a un edificio propio aunque un camino rival toque ese extremo', () => {
    const estado = con({ [centro.id]: poblado('a') }, { [aristaCentroN0]: 'b' });
    expect(puedeColocarCamino(mesa, estado, 'a', aristaCentroN1)).toEqual({ ok: true });
  });

  it('acepta continuando un camino propio', () => {
    const estado = con({}, { [aristaCentroN0]: 'a' });
    expect(puedeColocarCamino(mesa, estado, 'a', aristaN0X)).toEqual({ ok: true });
  });

  it('rechaza un camino aislado', () => {
    expect(puedeColocarCamino(mesa, base, 'a', aristaN0X)).toEqual({
      ok: false,
      motivo: 'SIN_CONEXION',
    });
  });

  it('rechaza continuar un camino propio a través de un poblado rival (corte)', () => {
    const estado = con({ [n0]: poblado('b') }, { [aristaCentroN0]: 'a' });
    expect(puedeColocarCamino(mesa, estado, 'a', aristaN0X)).toEqual({
      ok: false,
      motivo: 'CAMINO_CORTADO',
      detalle: { verticeCortado: n0, dueno: 'b' },
    });
  });

  it('rechaza junto a un edificio rival sin conexión propia', () => {
    const estado = con({ [n0]: poblado('b') }, {});
    expect(puedeColocarCamino(mesa, estado, 'a', aristaN0X)).toMatchObject({
      motivo: 'SIN_CONEXION',
    });
  });

  it('no cuenta un camino de otro jugador como conexión', () => {
    const estado = con({}, { [aristaCentroN0]: 'b' });
    expect(puedeColocarCamino(mesa, estado, 'a', aristaN0X)).toMatchObject({
      motivo: 'SIN_CONEXION',
    });
  });

  it('acepta si un extremo está cortado pero el otro conecta', () => {
    const estado = con({ [n0]: poblado('b'), [x]: poblado('a') }, { [aristaCentroN0]: 'a' });
    expect(puedeColocarCamino(mesa, estado, 'a', aristaN0X)).toEqual({ ok: true });
  });
});

describe('independencia de resultados', () => {
  it('devuelve un objeto nuevo en cada llamada', () => {
    const estado = con({ [centro.id]: poblado('a') }, {});
    const r1 = puedeColocarCamino(mesa, estado, 'a', aristaCentroN1);
    const r2 = puedeColocarCamino(mesa, estado, 'a', aristaCentroN1);
    expect(r1).not.toBe(r2);
  });

  it('no muta el estado recibido', () => {
    const estado = con({ [n0]: poblado('b') }, { [aristaCentroN0]: 'a' });
    const copia = structuredClone(estado);
    puedeColocarCamino(mesa, estado, 'a', aristaN0X);
    puedeColocarPoblado(mesa, estado, 'a', x, { requiereCamino: true });
    expect(estado).toEqual(copia);
  });
});
