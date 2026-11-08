import { describe, expect, it } from 'vitest';
import { clave } from '../mapa/coordenadas.js';
import { crearPartida } from './crear.js';
import { decidir } from './decidir.js';
import { conCambios, mesaDePrueba } from './pruebas.js';
import type { Edificio, Estado, JugadorId } from './tipos.js';
import { victimasPosibles } from './victimas.js';

const mesa = mesaDePrueba({ jugadores: 3 });
const inicial = crearPartida(mesa, ['a', 'b', 'c']);
const [yo, rival] = inicial.jugadores.map((j) => j.id) as [JugadorId, JugadorId];
const casillas = mesa.mapa.casillas;
const ladronEn = mesa.tablero.casillas[3]!.hex;
const forzar = (estado: Estado) =>
  decidir(mesa, estado, { tipo: 'SALTAR_TURNO_POR_INACTIVIDAD', jugador: yo });

/** Estado en MOVER_LADRON donde `rival` tiene cartas y un poblado en cada vértice de `en`. */
function conRivalEn(en: readonly { q: number; r: number; s: number }[]): Estado {
  const edificios: Record<string, Edificio> = {};
  for (const v of mesa.mapa.vertices) {
    if (v.casillas.some((c) => en.some((h) => clave(h) === clave(c)))) {
      edificios[v.id] = { dueno: rival, tipo: 'POBLADO' };
    }
  }
  return conCambios(inicial, {
    fase: 'MOVER_LADRON',
    pasoPreparacion: 6,
    turnoDe: 0,
    ladron: ladronEn,
    edificios,
    jugadores: inicial.jugadores.map((j) =>
      j.id === rival ? { ...j, recursos: { ...j.recursos, MADERA: 3 } } : j,
    ),
  });
}

describe('mover el ladrón por inactividad', () => {
  it('sin rivales cerca, sigue yendo a la primera casilla distinta de la actual', () => {
    const estado = conRivalEn([]);
    const r = forzar(estado);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const movido = r.eventos.find((e) => e.tipo === 'LADRON_MOVIDO');
      const esperada = casillas.find((c) => clave(c) !== clave(ladronEn))!;
      expect(movido).toMatchObject({ destino: esperada, causa: 'INACTIVIDAD' });
    }
  });

  it('si la primera casilla tiene un rival con cartas, no se atasca: elige otra sin víctimas', () => {
    const primera = casillas.find((c) => clave(c) !== clave(ladronEn))!;
    const estado = conRivalEn([primera]);
    expect(victimasPosibles(mesa, estado, yo, primera)).toEqual([rival]); // la trampa

    const r = forzar(estado);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.eventos.some((e) => e.tipo === 'CARTA_ROBADA')).toBe(false);
      const movido = r.eventos.find((e) => e.tipo === 'LADRON_MOVIDO')!;
      expect(clave(movido.destino as never)).not.toBe(clave(primera));
    }
  });

  it('si todas las casillas tienen víctima, roba a la primera en vez de quedarse bloqueado', () => {
    const estado = conRivalEn(casillas);
    const r = forzar(estado);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.eventos.find((e) => e.tipo === 'CARTA_ROBADA')).toMatchObject({
        ladron: yo,
        victima: rival,
      });
    }
  });

  it('con ladrón amistoso y rivales protegidos, tampoco roba', () => {
    const amistosa = mesaDePrueba({ jugadores: 3, ladronAmistoso: true });
    const base = crearPartida(amistosa, ['a', 'b', 'c']);
    const [x, y] = base.jugadores.map((j) => j.id) as [JugadorId, JugadorId];
    const estado = conCambios(base, {
      fase: 'MOVER_LADRON',
      pasoPreparacion: 6,
      turnoDe: 0,
      ladron: amistosa.tablero.casillas[3]!.hex,
      edificios: Object.fromEntries(
        amistosa.mapa.vertices.map((v) => [v.id, { dueno: y, tipo: 'POBLADO' as const }]),
      ),
      jugadores: base.jugadores.map((j) =>
        j.id === y ? { ...j, recursos: { ...j.recursos, MADERA: 3 } } : j,
      ),
    });
    // y tiene tantos poblados que no está protegido: roba. Con 2 poblados sí lo estaría.
    const pocos = conCambios(estado, {
      edificios: Object.fromEntries(Object.entries(estado.edificios).slice(0, 2)),
    });
    const r = decidir(amistosa, pocos, { tipo: 'SALTAR_TURNO_POR_INACTIVIDAD', jugador: x });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.eventos.some((e) => e.tipo === 'CARTA_ROBADA')).toBe(false);
  });
});
