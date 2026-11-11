import { describe, expect, it } from 'vitest';
import { aMapaConfig, CATALOGO } from '../catalogo/catalogo.js';
import { verticesDeCasilla } from '../mapa/mapa.js';
import type { Recurso } from '../reglas/recursos.js';
import { crearPartida } from './crear.js';
import { RECURSO_POR_TERRENO, repartirProduccion } from './produccion.js';
import { conCambios, mesaDePrueba } from './pruebas.js';
import type { Edificio, JugadorId } from './tipos.js';

const SEMILLAS = ['uno', 'dos', 'tres', 'cuatro'];
const SUMAS = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
const BANCO_SOBRADO = { MADERA: 999, LADRILLO: 999, OVEJA: 999, TRIGO: 999, MINERAL: 999 };

type Cuenta = Map<string, number>;
const clavePedido = (j: JugadorId, r: Recurso): string => `${j}|${r}`;

describe('produccion en todos los mapas', () => {
  for (const mapa of CATALOGO) {
    it(`${mapa.id}: cada jugador cobra solo de las casillas con la ficha tirada que tocan sus edificios`, () => {
      for (const semilla of SEMILLAS) {
        const mesa = mesaDePrueba({ semilla, jugadores: 2, mapa: aMapaConfig(mapa) });
        const base = crearPartida(mesa, ['a', 'b']);
        // Un edificio en cada vértice, alternando dueño y tipo (sin respetar la regla de distancia).
        const edificios: Record<string, Edificio> = {};
        mesa.mapa.vertices.forEach((v, i) => {
          edificios[v.id] = {
            dueno: i % 2 === 0 ? 'a' : 'b',
            tipo: i % 3 === 0 ? 'CIUDAD' : 'POBLADO',
          };
        });
        const estado = conCambios(base, { edificios, ladron: null, banco: BANCO_SOBRADO });

        for (const suma of SUMAS) {
          // Esperado, calculado solo con la geometría de cada casilla.
          const esperado: Cuenta = new Map();
          for (const casilla of mesa.tablero.casillas) {
            const recurso = RECURSO_POR_TERRENO[casilla.terreno];
            if (casilla.ficha !== suma || recurso === null) continue;
            for (const id of verticesDeCasilla(casilla.hex)) {
              const e = edificios[id];
              if (!e) continue;
              const k = clavePedido(e.dueno, recurso);
              esperado.set(k, (esperado.get(k) ?? 0) + (e.tipo === 'CIUDAD' ? 2 : 1));
            }
          }
          const real: Cuenta = new Map();
          for (const ev of repartirProduccion(mesa, estado, suma)) {
            if (ev.tipo !== 'RECURSOS_REPARTIDOS') continue;
            const k = clavePedido(ev.jugador, ev.recurso);
            real.set(k, (real.get(k) ?? 0) + ev.cantidad);
          }
          expect(Object.fromEntries(real), `${mapa.id} ${semilla} suma ${suma}`).toEqual(
            Object.fromEntries(esperado),
          );
        }
      }
    });
  }
});
