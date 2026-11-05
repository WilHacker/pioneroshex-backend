import { describe, expect, it } from 'vitest';
import { eventosPara } from './eventos.js';
import type { Evento } from './tipos.js';

describe('eventosPara: filtrado de eventos privados por observador', () => {
  const eventos: readonly Evento[] = [
    {
      tipo: 'DADOS_TIRADOS',
      jugador: 'j0',
      dados: [3, 4],
    },
    {
      tipo: 'LADRON_MOVIDO',
      jugador: 'j0',
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
});
