import { describe, expect, it } from 'vitest';
import type { Accion } from '../estado/tipos.js';
import { crearRng } from '../reglas/azar.js';
import { elegirAccion } from './bot.js';

const j = 'ana';
const ciudad: Accion = { tipo: 'CONSTRUIR_CIUDAD', jugador: j, vertice: 'v1' };
const poblado: Accion = { tipo: 'CONSTRUIR_POBLADO', jugador: j, vertice: 'v2' };
const caminos: Accion[] = [
  { tipo: 'CONSTRUIR_CAMINO', jugador: j, arista: 'a1' },
  { tipo: 'CONSTRUIR_CAMINO', jugador: j, arista: 'a2' },
];
const terminar: Accion = { tipo: 'TERMINAR_TURNO', jugador: j };
const SEMILLAS = Array.from({ length: 200 }, (_, i) => `bot-${i}`);

/** Cuántas veces sale cada acción eligiendo con 200 semillas distintas. */
function frecuencias(acciones: readonly Accion[]): Map<Accion, number> {
  const cuenta = new Map<Accion, number>();
  for (const semilla of SEMILLAS) {
    const elegida = elegirAccion(acciones, crearRng(semilla));
    cuenta.set(elegida, (cuenta.get(elegida) ?? 0) + 1);
  }
  return cuenta;
}

describe('elegirAccion', () => {
  it('prefiere ciudad sobre poblado y poblado sobre camino', () => {
    expect([...frecuencias([...caminos, poblado, ciudad]).keys()]).toEqual([ciudad]);
    expect([...frecuencias([...caminos, poblado]).keys()]).toEqual([poblado]);
  });

  it('elige al azar dentro del grupo de mayor prioridad', () => {
    const cuenta = frecuencias(caminos);
    expect(cuenta.get(caminos[0]!)).toBeGreaterThan(50);
    expect(cuenta.get(caminos[1]!)).toBeGreaterThan(50);
  });

  it('a veces (≈20 %) termina el turno antes aunque pueda construir', () => {
    const veces = frecuencias([ciudad, terminar]).get(terminar) ?? 0;
    expect(veces).toBeGreaterThan(20);
    expect(veces).toBeLessThan(70);
  });

  it('en la preparación elige al azar entre las colocaciones', () => {
    const colocaciones: Accion[] = ['v1', 'v2', 'v3'].map((vertice) => ({
      tipo: 'COLOCAR_POBLADO_INICIAL',
      jugador: j,
      vertice,
    }));
    const elegidas = [...frecuencias(colocaciones).keys()];
    expect(elegidas).toHaveLength(3);
    expect(elegidas.every((a) => colocaciones.includes(a))).toBe(true);
  });

  it('con una sola acción (tirar los dados) devuelve esa', () => {
    const tirar: Accion = { tipo: 'TIRAR_DADOS', jugador: j };
    expect(elegirAccion([tirar], crearRng('x'))).toBe(tirar);
  });

  it('es determinista con la misma semilla y falla si no hay acciones', () => {
    const todas = [...caminos, terminar];
    expect(elegirAccion(todas, crearRng('s'))).toBe(elegirAccion(todas, crearRng('s')));
    expect(() => elegirAccion([], crearRng('s'))).toThrow(/sin acciones/);
  });
});
