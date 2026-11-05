import { describe, expect, it } from 'vitest';
import { enumerarAcciones } from '../estado/acciones.js';
import { aplicar } from '../estado/aplicar.js';
import { crearPartida } from '../estado/crear.js';
import { conCambios, mesaDePrueba } from '../estado/pruebas.js';
import type { Estado } from '../estado/tipos.js';
import { verificarInvariantes } from './invariantes.js';

const mesa = mesaDePrueba({ jugadores: 3 });

/** Preparación completa y primera tirada, eligiendo siempre la primera acción legal. */
function estadoSano(): Estado {
  let estado = crearPartida(mesa, ['ana', 'beto', 'caro']);
  while (estado.fase !== 'FASE_PRINCIPAL') {
    const [accion] = enumerarAcciones(mesa, estado, estado.jugadores[estado.turnoDe]!.id);
    const resultado = aplicar(mesa, estado, accion!);
    if (!resultado.ok) throw new Error(resultado.motivo);
    estado = resultado.estado;
  }
  return estado;
}

const sano = estadoSano();
const [primerVertice, primerEdificio] = Object.entries(sano.edificios)[0]!;
const conJugador = (i: number, cambios: Partial<Estado['jugadores'][number]>): Estado =>
  conCambios(sano, {
    jugadores: sano.jugadores.map((j, k) => (k === i ? { ...j, ...cambios } : j)),
  });
const violaciones = (estado: Estado, patron: RegExp) =>
  verificarInvariantes(mesa, estado).filter((v) => patron.test(v));

describe('verificarInvariantes', () => {
  it('devuelve [] en un estado sano (inicial y tras la preparación)', () => {
    expect(verificarInvariantes(mesa, crearPartida(mesa, ['ana', 'beto', 'caro']))).toEqual([]);
    expect(Object.keys(sano.edificios)).toHaveLength(6);
    expect(verificarInvariantes(mesa, sano)).toEqual([]);
  });

  it('detecta recursos creados o perdidos (banco + manos ≠ banco inicial)', () => {
    const roto = conCambios(sano, { banco: { ...sano.banco, MADERA: sano.banco.MADERA + 1 } });
    expect(violaciones(roto, /^RECURSOS_DESCUADRADOS:MADERA/)).toHaveLength(1);
  });

  it('detecta piezas que no cuadran con los límites', () => {
    const { piezasRestantes } = sano.jugadores[0]!;
    const roto = conJugador(0, {
      piezasRestantes: { ...piezasRestantes, caminos: piezasRestantes.caminos - 1 },
    });
    expect(violaciones(roto, /^PIEZAS_DESCUADRADAS:.*:caminos/)).toHaveLength(1);
  });

  it('cuenta las ciudades en ciudades y no en poblados', () => {
    const roto = conCambios(sano, {
      edificios: { ...sano.edificios, [primerVertice]: { ...primerEdificio, tipo: 'CIUDAD' } },
    });
    const piezas = violaciones(roto, /^PIEZAS_DESCUADRADAS/);
    expect(piezas.some((v) => v.endsWith(':poblados'))).toBe(true);
    expect(piezas.some((v) => v.endsWith(':ciudades'))).toBe(true);
  });

  it('detecta dos edificios en vértices vecinos', () => {
    const vecino = mesa.vertice(primerVertice)!.vecinos[0]!;
    const roto = conCambios(sano, {
      edificios: { ...sano.edificios, [vecino]: { ...primerEdificio } },
    });
    expect(violaciones(roto, /^EDIFICIOS_VECINOS/).length).toBeGreaterThan(0);
  });

  it('detecta un camino que no toca nada propio', () => {
    const ocupados = new Set(
      Object.keys(sano.caminos)
        .flatMap((a) => mesa.arista(a)!.vertices)
        .concat(Object.keys(sano.edificios)),
    );
    const suelta = mesa.mapa.aristas.find((a) => a.vertices.every((v) => !ocupados.has(v)))!;
    const roto = conCambios(sano, { caminos: { ...sano.caminos, [suelta.id]: 'ana' } });
    expect(violaciones(roto, /^CAMINO_SUELTO/)).toEqual([`CAMINO_SUELTO:${suelta.id}`]);
  });

  it('detecta recursos negativos en una mano o en el banco', () => {
    const mano = conJugador(1, { recursos: { ...sano.jugadores[1]!.recursos, TRIGO: -1 } });
    expect(violaciones(mano, /^RECURSO_NEGATIVO/)).toHaveLength(1);
    const banco = conCambios(sano, { banco: { ...sano.banco, OVEJA: -1 } });
    expect(violaciones(banco, /^RECURSO_NEGATIVO:banco:OVEJA/)).toHaveLength(1);
  });

  it.each([-1, 3, 1.5])('detecta turnoDe inválido (%s)', (turnoDe) => {
    expect(violaciones(conCambios(sano, { turnoDe }), /^TURNO_INVALIDO/)).toHaveLength(1);
  });

  it('detecta ganador sin FIN y FIN sin ganador', () => {
    expect(violaciones(conCambios(sano, { ganador: 'ana' }), /^GANADOR_INCOHERENTE/)).toHaveLength(
      1,
    );
    expect(violaciones(conCambios(sano, { fase: 'FIN' }), /^GANADOR_INCOHERENTE/)).toHaveLength(1);
    expect(verificarInvariantes(mesa, conCambios(sano, { fase: 'FIN', ganador: 'ana' }))).toEqual(
      [],
    );
  });
});
