import { describe, expect, it } from 'vitest';
import { eventosPara } from './eventos.js';
import type { Evento } from './tipos.js';

describe('eventosPara: filtrado de eventos privados por observador', () => {
  const eventos: readonly Evento[] = [
    {
      tipo: 'DADOS_TIRADOS',
      jugador: 'j0',
      causa: 'VOLUNTARIA',
      dados: [3, 4],
    },
    {
      tipo: 'LADRON_MOVIDO',
      jugador: 'j0',
      causa: 'VOLUNTARIA',
      destino: { q: 1, r: -1, s: 0 },
    },
    {
      tipo: 'CARTA_ROBADA',
      ladron: 'j0',
      victima: 'j1',
      recurso: 'TRIGO',
    },
  ];

  it('el ladron ve el recurso que robó', () => {
    const filtrados = eventosPara(eventos, 'j0');
    expect(filtrados).toEqual(eventos);
  });

  it('la víctima ve el recurso que le fue robado', () => {
    const filtrados = eventosPara(eventos, 'j1');
    expect(filtrados).toEqual(eventos);
  });

  it('un tercer jugador no ve el recurso robado (recurso: null)', () => {
    const filtrados = eventosPara(eventos, 'j2');
    expect(filtrados).toEqual([
      eventos[0],
      eventos[1],
      {
        tipo: 'CARTA_ROBADA',
        ladron: 'j0',
        victima: 'j1',
        recurso: null,
      },
    ]);
  });

  it('un espectador (null) tampoco ve el recurso robado', () => {
    const filtrados = eventosPara(eventos, null);
    expect(filtrados).toEqual([
      eventos[0],
      eventos[1],
      {
        tipo: 'CARTA_ROBADA',
        ladron: 'j0',
        victima: 'j1',
        recurso: null,
      },
    ]);
  });

  it('no muta el array ni los eventos originales', () => {
    const original = JSON.stringify(eventos);
    eventosPara(eventos, 'j2');
    expect(JSON.stringify(eventos)).toBe(original);
  });

  it('oculta la carta comprada a terceros pero la muestra al comprador', () => {
    const compra: readonly Evento[] = [
      {
        tipo: 'CARTA_DESARROLLO_COMPRADA',
        jugador: 'j0',
        carta: 'PUNTO_VICTORIA',
        costo: { OVEJA: 1, TRIGO: 1, MINERAL: 1 },
      },
    ];
    expect(eventosPara(compra, 'j0')[0]).toEqual(compra[0]);
    expect(eventosPara(compra, 'j1')[0]).toEqual({
      tipo: 'CARTA_DESARROLLO_COMPRADA',
      jugador: 'j0',
      carta: null,
      costo: { OVEJA: 1, TRIGO: 1, MINERAL: 1 },
    });
    expect(eventosPara(compra, null)[0]).toEqual({
      tipo: 'CARTA_DESARROLLO_COMPRADA',
      jugador: 'j0',
      carta: null,
      costo: { OVEJA: 1, TRIGO: 1, MINERAL: 1 },
    });
  });

  it('oculta recursoRobado en CABALLERO_JUGADO a observadores no involucrados', () => {
    const caballero: readonly Evento[] = [
      {
        tipo: 'CABALLERO_JUGADO',
        jugador: 'j0',
        destino: { q: 0, r: 0, s: 0 },
        victima: 'j1',
        recursoRobado: 'MINERAL',
      },
    ];
    expect(eventosPara(caballero, 'j0')[0]).toEqual(caballero[0]);
    expect(eventosPara(caballero, 'j1')[0]).toEqual(caballero[0]);
    expect(eventosPara(caballero, 'j2')[0]).toEqual({
      tipo: 'CABALLERO_JUGADO',
      jugador: 'j0',
      destino: { q: 0, r: 0, s: 0 },
      victima: 'j1',
      recursoRobado: null,
    });
  });
});
