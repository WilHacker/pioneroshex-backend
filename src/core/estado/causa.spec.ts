import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { aplicar } from './aplicar.js';
import { crearPartida } from './crear.js';
import { desglosePuntos } from './puntos.js';
import { conCambios, mesaDePrueba } from './pruebas.js';
import type { Accion, Estado, Evento } from './tipos.js';

/** Eventos de una acción que debe aceptarse. */
function eventosDe(
  mesa: ReturnType<typeof mesaDePrueba>,
  estado: Estado,
  accion: Accion,
): Evento[] {
  const r = aplicar(mesa, estado, accion);
  if (!r.ok) throw new Error(r.motivo);
  return [...r.eventos];
}

describe('causa de los eventos: voluntaria o por inactividad', () => {
  const mesa = mesaDePrueba({ jugadores: 3 });
  const inicial = crearPartida(mesa, ['a', 'b', 'c']);
  const a = inicial.jugadores[0]!.id;
  const preTirada = conCambios(inicial, { fase: 'PRE_TIRADA', pasoPreparacion: 6 });
  const principal = conCambios(preTirada, { fase: 'FASE_PRINCIPAL' });

  it('los dados: TIRAR_DADOS es voluntaria y saltar por inactividad no', () => {
    const voluntaria = eventosDe(mesa, preTirada, { tipo: 'TIRAR_DADOS', jugador: a });
    const forzada = eventosDe(mesa, preTirada, {
      tipo: 'SALTAR_TURNO_POR_INACTIVIDAD',
      jugador: a,
    });
    expect(voluntaria[0]).toMatchObject({ tipo: 'DADOS_TIRADOS', causa: 'VOLUNTARIA' });
    expect(forzada[0]).toMatchObject({ tipo: 'DADOS_TIRADOS', causa: 'INACTIVIDAD' });
  });

  it('el fin de turno: TERMINAR_TURNO es voluntario y saltar por inactividad no', () => {
    const voluntaria = eventosDe(mesa, principal, { tipo: 'TERMINAR_TURNO', jugador: a });
    const forzada = eventosDe(mesa, principal, {
      tipo: 'SALTAR_TURNO_POR_INACTIVIDAD',
      jugador: a,
    });
    expect(voluntaria[0]).toMatchObject({ tipo: 'TURNO_TERMINADO', causa: 'VOLUNTARIA' });
    expect(forzada[0]).toMatchObject({ tipo: 'TURNO_TERMINADO', causa: 'INACTIVIDAD' });
  });

  it('el ladrón: moverlo es voluntario y saltar por inactividad no', () => {
    const enLadron = conCambios(principal, { fase: 'MOVER_LADRON' });
    const { ladron } = enLadron;
    const destino = mesa.mapa.casillas.find(
      (c) => c.q !== ladron?.q || c.r !== ladron?.r || c.s !== ladron?.s,
    )!;
    const voluntaria = eventosDe(mesa, enLadron, {
      tipo: 'MOVER_LADRON',
      jugador: a,
      destino,
      victima: null,
    });
    const forzada = eventosDe(mesa, enLadron, { tipo: 'SALTAR_TURNO_POR_INACTIVIDAD', jugador: a });
    expect(voluntaria[0]).toMatchObject({ tipo: 'LADRON_MOVIDO', causa: 'VOLUNTARIA' });
    expect(forzada[0]).toMatchObject({ tipo: 'LADRON_MOVIDO', causa: 'INACTIVIDAD' });
  });

  it('el descarte: DESCARTAR_RECURSOS es voluntario y DESCARTE_AUTOMATICO es por inactividad', () => {
    const enDescarte = produce(
      conCambios(principal, { fase: 'DESCARTE', descartesPendientes: { [a]: 4 } }),
      (e) => {
        e.jugadores[0]!.recursos = { MADERA: 8, LADRILLO: 0, OVEJA: 0, TRIGO: 0, MINERAL: 0 };
      },
    );
    const voluntaria = eventosDe(mesa, enDescarte, {
      tipo: 'DESCARTAR_RECURSOS',
      jugador: a,
      recursos: { MADERA: 4 },
    });
    const forzada = eventosDe(mesa, enDescarte, { tipo: 'DESCARTE_AUTOMATICO', jugador: a });
    expect(voluntaria[0]).toMatchObject({ tipo: 'RECURSOS_DESCARTADOS', causa: 'VOLUNTARIA' });
    expect(forzada[0]).toMatchObject({ tipo: 'RECURSOS_DESCARTADOS', causa: 'INACTIVIDAD' });
  });

  it('la construcción especial: pasar es voluntario y saltar por inactividad no', () => {
    const mesaB = mesaDePrueba({ jugadores: 5, turnRuleMode: 'B' });
    const partidaB = crearPartida(mesaB, ['a', 'b', 'c', 'd', 'e']);
    const especial = conCambios(partidaB, {
      fase: 'CONSTRUCCION_ESPECIAL',
      pasoPreparacion: 10,
      turnoDe: 0,
      turnoEspecialDe: 1,
    });
    const constructor = partidaB.jugadores[1]!.id;
    const voluntaria = eventosDe(mesaB, especial, {
      tipo: 'PASAR_CONSTRUCCION_ESPECIAL',
      jugador: constructor,
    });
    const forzada = eventosDe(mesaB, especial, {
      tipo: 'SALTAR_TURNO_POR_INACTIVIDAD',
      jugador: constructor,
    });
    expect(voluntaria[0]).toMatchObject({
      tipo: 'CONSTRUCCION_ESPECIAL_PASADA',
      causa: 'VOLUNTARIA',
    });
    expect(forzada[0]).toMatchObject({
      tipo: 'CONSTRUCCION_ESPECIAL_PASADA',
      causa: 'INACTIVIDAD',
    });
  });

  it('un turno que acaba al pasar la última construcción especial hereda la causa', () => {
    const mesaB = mesaDePrueba({ jugadores: 5, turnRuleMode: 'B' });
    const partidaB = crearPartida(mesaB, ['a', 'b', 'c', 'd', 'e']);
    const ultimo = conCambios(partidaB, {
      fase: 'CONSTRUCCION_ESPECIAL',
      pasoPreparacion: 10,
      turnoDe: 0,
      turnoEspecialDe: 4,
    });
    const forzada = eventosDe(mesaB, ultimo, {
      tipo: 'SALTAR_TURNO_POR_INACTIVIDAD',
      jugador: partidaB.jugadores[4]!.id,
    });
    expect(forzada.map((e) => e.tipo)).toEqual(['CONSTRUCCION_ESPECIAL_PASADA', 'TURNO_TERMINADO']);
    expect(forzada[1]).toMatchObject({ tipo: 'TURNO_TERMINADO', causa: 'INACTIVIDAD' });
  });
});

describe('PARTIDA_GANADA trae el desglose de puntos', () => {
  const mesa = mesaDePrueba();
  const partida = crearPartida(mesa, ['a', 'b', 'c', 'd']);
  const yo = partida.jugadores[0]!.id;
  const vertices = mesa.mapa.vertices.slice(0, 9).map((v) => v.id);
  const nueve = produce(
    conCambios(partida, {
      fase: 'FASE_PRINCIPAL',
      pasoPreparacion: 8,
      edificios: Object.fromEntries(vertices.map((v) => [v, { dueno: yo, tipo: 'POBLADO' }])),
    }),
    (e) => {
      e.jugadores[0]!.recursos = { MADERA: 9, LADRILLO: 9, OVEJA: 9, TRIGO: 9, MINERAL: 9 };
    },
  );

  it('al aplicar, el evento de victoria lleva el desglose y su total coincide con los puntos', () => {
    const eventos = eventosDe(mesa, nueve, {
      tipo: 'CONSTRUIR_CIUDAD',
      jugador: yo,
      vertice: vertices[0]!,
    });
    const victoria = eventos.at(-1);
    expect(victoria).toEqual({
      tipo: 'PARTIDA_GANADA',
      jugador: yo,
      puntos: 10,
      desglose: {
        poblados: 8,
        ciudades: 2,
        granEjercito: 0,
        granRuta: 0,
        cartasPuntoVictoria: 0,
        total: 10,
      },
    });
  });

  it('desglosePuntos suma ejército, ruta y cartas ocultas', () => {
    const estado = produce(nueve, (e) => {
      e.granEjercito = yo;
      e.granRuta = yo;
      e.jugadores[0]!.cartasDesarrollo = ['PUNTO_VICTORIA', 'PUNTO_VICTORIA'];
    });
    expect(desglosePuntos(estado, yo)).toEqual({
      poblados: 9,
      ciudades: 0,
      granEjercito: 2,
      granRuta: 2,
      cartasPuntoVictoria: 2,
      total: 15,
    });
  });
});
