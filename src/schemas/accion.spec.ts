import { describe, expect, it } from 'vitest';
import { accionDeJugador, esquemaAccionEntrante } from './accion.js';

const hex = { q: 1, r: -1, s: 0 };

describe('esquemaAccionEntrante', () => {
  it.each([
    { tipo: 'TIRAR_DADOS' },
    { tipo: 'TERMINAR_TURNO' },
    { tipo: 'COMPRAR_CARTA_DESARROLLO' },
    { tipo: 'PASAR_CONSTRUCCION_ESPECIAL' },
    { tipo: 'CONSTRUIR_CAMINO', arista: 'a|b' },
    { tipo: 'CONSTRUIR_POBLADO', vertice: '0,0|1,0|0,1' },
    { tipo: 'CONSTRUIR_CIUDAD', vertice: '0,0|1,0|0,1' },
    { tipo: 'COLOCAR_POBLADO_INICIAL', vertice: 'v' },
    { tipo: 'COLOCAR_CAMINO_INICIAL', arista: 'a' },
    { tipo: 'DESCARTAR_RECURSOS', recursos: { MADERA: 2, TRIGO: 1 } },
    { tipo: 'MOVER_LADRON', destino: hex, victima: null },
    { tipo: 'MOVER_LADRON', destino: hex, victima: 'j2' },
    { tipo: 'CAMBIAR_CON_BANCA', entrega: 'MADERA', recibe: 'MINERAL' },
    { tipo: 'PROPONER_TRATO', entrega: { MADERA: 1 }, pide: { OVEJA: 1 } },
    { tipo: 'PROPONER_TRATO', entrega: { MADERA: 1 }, pide: { OVEJA: 1 }, destinatario: 'j2' },
    { tipo: 'ACEPTAR_TRATO', tratoId: 't1' },
    { tipo: 'RECHAZAR_TRATO', tratoId: 't1' },
    { tipo: 'CANCELAR_TRATO', tratoId: 't1' },
    {
      tipo: 'CONTRAOFERTAR_TRATO',
      tratoIdOriginal: 't1',
      entrega: { MADERA: 1 },
      pide: { OVEJA: 2 },
    },
    { tipo: 'JUGAR_CABALLERO', destino: hex, victima: null },
    { tipo: 'JUGAR_CONSTRUCCION_CARRETERAS', aristas: ['a'] },
    { tipo: 'JUGAR_CONSTRUCCION_CARRETERAS', aristas: ['a', 'b'] },
    { tipo: 'JUGAR_ABUNDANCIA', recursos: ['MADERA', 'TRIGO'] },
    { tipo: 'JUGAR_MONOPOLIO', recurso: 'OVEJA' },
  ])('acepta %j', (entrada) => {
    expect(esquemaAccionEntrante.safeParse(entrada).success).toBe(true);
  });

  it.each([
    ['sin tipo', {}],
    ['tipo desconocido', { tipo: 'HACER_TRAMPA' }],
    ['no es un objeto', 'TIRAR_DADOS'],
    ['null', null],
    ['las acciones del reloj son solo del servidor', { tipo: 'DESCARTE_AUTOMATICO' }],
    ['saltar por inactividad es solo del servidor', { tipo: 'SALTAR_TURNO_POR_INACTIVIDAD' }],
    ['arista que no es texto', { tipo: 'CONSTRUIR_CAMINO', arista: 3 }],
    ['arista demasiado larga', { tipo: 'CONSTRUIR_CAMINO', arista: 'x'.repeat(200) }],
    ['falta el vértice', { tipo: 'CONSTRUIR_POBLADO' }],
    ['recurso inventado', { tipo: 'JUGAR_MONOPOLIO', recurso: 'ORO' }],
    ['cantidad negativa', { tipo: 'DESCARTAR_RECURSOS', recursos: { MADERA: -1 } }],
    ['cantidad no entera', { tipo: 'DESCARTAR_RECURSOS', recursos: { MADERA: 1.5 } }],
    ['cantidad absurda', { tipo: 'PROPONER_TRATO', entrega: { MADERA: 1e9 }, pide: {} }],
    ['recurso desconocido en un mapa', { tipo: 'DESCARTAR_RECURSOS', recursos: { ORO: 1 } }],
    [
      'casilla que no suma cero',
      { tipo: 'MOVER_LADRON', destino: { q: 1, r: 1, s: 1 }, victima: null },
    ],
    ['casilla incompleta', { tipo: 'MOVER_LADRON', destino: { q: 1, r: -1 }, victima: null }],
    ['víctima ausente', { tipo: 'MOVER_LADRON', destino: hex }],
    ['tres carreteras', { tipo: 'JUGAR_CONSTRUCCION_CARRETERAS', aristas: ['a', 'b', 'c'] }],
    ['cero carreteras', { tipo: 'JUGAR_CONSTRUCCION_CARRETERAS', aristas: [] }],
    ['abundancia con un solo recurso', { tipo: 'JUGAR_ABUNDANCIA', recursos: ['MADERA'] }],
    ['cambio con la banca sin recibe', { tipo: 'CAMBIAR_CON_BANCA', entrega: 'MADERA' }],
  ])('rechaza: %s', (_nombre, entrada) => {
    expect(esquemaAccionEntrante.safeParse(entrada).success).toBe(false);
  });

  it('no admite el campo jugador: lo pone el servidor, no el cliente', () => {
    const r = esquemaAccionEntrante.safeParse({ tipo: 'TIRAR_DADOS', jugador: 'otro' });
    expect(r.success).toBe(false);
  });

  it('no admite campos de más (evita colar basura hasta el motor)', () => {
    const r = esquemaAccionEntrante.safeParse({ tipo: 'TERMINAR_TURNO', extra: 1 });
    expect(r.success).toBe(false);
  });
});

describe('accionDeJugador', () => {
  it('pone el jugador autenticado en la acción', () => {
    const entrante = esquemaAccionEntrante.parse({ tipo: 'CONSTRUIR_CAMINO', arista: 'a' });
    expect(accionDeJugador(entrante, 'j3')).toEqual({
      tipo: 'CONSTRUIR_CAMINO',
      arista: 'a',
      jugador: 'j3',
    });
  });
});
