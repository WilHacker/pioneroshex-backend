import fc from 'fast-check';
import { hex } from '../mapa/coordenadas.js';
import { crearMapa, verticesDeCasilla } from '../mapa/mapa.js';
import { validarDistancia } from './distancia.js';

const mapa = crearMapa(2);
const porId = new Map(mapa.vertices.map((v) => [v.id, v]));
const [centro] = verticesDeCasilla(hex(0, 0));
const vecinosDelCentro = porId.get(centro)?.vecinos ?? [];

describe('validarDistancia', () => {
  it('acepta cualquier vértice cuando el tablero está vacío', () => {
    for (const v of mapa.vertices) {
      expect(validarDistancia(mapa, new Set(), v.id)).toEqual({ ok: true });
    }
  });

  it('rechaza un vértice que no existe en el mapa', () => {
    expect(validarDistancia(mapa, new Set(), 'no-existe')).toEqual({
      ok: false,
      motivo: 'VERTICE_INEXISTENTE',
    });
  });

  it('rechaza un vértice ya ocupado', () => {
    expect(validarDistancia(mapa, new Set([centro]), centro)).toEqual({
      ok: false,
      motivo: 'VERTICE_OCUPADO',
    });
  });

  it('rechaza cada vecino de un vértice ocupado (regla de la distancia)', () => {
    expect(vecinosDelCentro.length).toBeGreaterThanOrEqual(2);
    for (const vecino of vecinosDelCentro) {
      expect(validarDistancia(mapa, new Set([centro]), vecino)).toEqual({
        ok: false,
        motivo: 'DEMASIADO_CERCA',
        detalle: { vecinoOcupado: centro },
      });
    }
  });

  it('acepta un vértice a dos aristas de distancia', () => {
    const aDos = vecinosDelCentro
      .flatMap((id) => porId.get(id)?.vecinos ?? [])
      .filter((id) => id !== centro && !vecinosDelCentro.includes(id));
    expect(aDos.length).toBeGreaterThan(0);
    for (const id of aDos) {
      expect(validarDistancia(mapa, new Set([centro]), id)).toEqual({ ok: true });
    }
  });

  it('la distancia cuenta poblados de cualquier jugador y se mira en ambos sentidos', () => {
    const [vecino] = vecinosDelCentro;
    expect(validarDistancia(mapa, new Set([vecino]), centro)).toEqual({
      ok: false,
      motivo: 'DEMASIADO_CERCA',
      detalle: { vecinoOcupado: vecino },
    });
  });

  it('si el vértice está ocupado, el motivo es VERTICE_OCUPADO aunque también haya un vecino ocupado', () => {
    const [vecino] = vecinosDelCentro;
    expect(validarDistancia(mapa, new Set([centro, vecino]), centro)).toEqual({
      ok: false,
      motivo: 'VERTICE_OCUPADO',
    });
  });

  it('no muta el conjunto de ocupados', () => {
    const ocupados = new Set([centro]);
    validarDistancia(mapa, ocupados, vecinosDelCentro[0]);
    expect([...ocupados]).toEqual([centro]);
  });

  it('propiedad: con un vértice ocupado, solo él y sus vecinos quedan rechazados', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), fc.nat(), (R, azar) => {
        const m = crearMapa(R);
        const ocupado = m.vertices[azar % m.vertices.length];
        const prohibidos = new Set([ocupado.id, ...ocupado.vecinos]);
        return m.vertices.every(
          (v) => validarDistancia(m, new Set([ocupado.id]), v.id).ok === !prohibidos.has(v.id),
        );
      }),
    );
  });
});
