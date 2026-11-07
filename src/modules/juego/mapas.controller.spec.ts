import { describe, expect, it } from 'vitest';
import { MapasController } from './mapas.controller.js';

describe('MapasController', () => {
  const controlador = new MapasController();

  it('GET /mapas devuelve el catálogo con su forma y sus rangos', () => {
    const lista = controlador.listar();
    expect(lista.length).toBe(15);
    expect(lista.find((m) => m.id === 'tierra')).toMatchObject({
      nombre: 'Tierra',
      casillas: 94,
      maximoRecomendado: 12,
    });
    expect(lista.every((m) => m.forma.length === m.casillas)).toBe(true);
  });

  it('devuelve siempre la misma lista (calculada una sola vez)', () => {
    expect(controlador.listar()).toBe(controlador.listar());
  });
});
