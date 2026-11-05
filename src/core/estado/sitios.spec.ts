import { describe, expect, it } from 'vitest';
import { clave } from '../mapa/coordenadas.js';
import { accionesDisponibles, ayuda, SITIOS_VACIOS } from './acciones.js';
import { aplicar } from './aplicar.js';
import { crearPartida } from './crear.js';
import { conCambios, mesaDePrueba } from './pruebas.js';
import type { Accion, Estado, JugadorId } from './tipos.js';

const mesa = mesaDePrueba({ jugadores: 3 });
const inicial = crearPartida(mesa, ['a', 'b', 'c']);
const enTurno = (e: Estado): JugadorId => e.jugadores[e.turnoDe]!.id;
const otro = (e: Estado): JugadorId => e.jugadores.find((j) => j.id !== enTurno(e))!.id;
const verticeLibre = mesa.mapa.vertices[0]!;

function jugar(estado: Estado, accion: Accion): Estado {
  const r = aplicar(mesa, estado, accion);
  if (!r.ok) throw new Error(`rechazada: ${r.motivo}`);
  return r.estado;
}

describe('ayuda: sitios legales', () => {
  it('al empezar, quien tiene el turno puede poner un poblado en cualquier vértice', () => {
    const { sitios } = ayuda(mesa, inicial, enTurno(inicial));
    expect([...sitios.poblados].toSorted()).toEqual(mesa.mapa.vertices.map((v) => v.id).toSorted());
    expect(sitios.caminos).toEqual([]);
    expect(sitios.ciudades).toEqual([]);
  });

  it('quien no tiene el turno no tiene ningún sitio', () => {
    expect(ayuda(mesa, inicial, otro(inicial)).sitios).toEqual(SITIOS_VACIOS);
  });

  it('tras el poblado inicial solo se ofrecen las aristas que lo tocan', () => {
    const jugador = enTurno(inicial);
    const despues = jugar(inicial, {
      tipo: 'COLOCAR_POBLADO_INICIAL',
      jugador,
      vertice: verticeLibre.id,
    });
    const { sitios } = ayuda(mesa, despues, jugador);
    const aristasDelVertice = mesa.mapa.aristas
      .filter((a) => a.vertices.includes(verticeLibre.id))
      .map((a) => a.id);
    expect([...sitios.caminos].toSorted()).toEqual(aristasDelVertice.toSorted());
    expect(sitios.poblados).toEqual([]);
  });

  it('un poblado propio se puede mejorar a ciudad si alcanzan los recursos', () => {
    const jugador = enTurno(inicial);
    const principal = conCambios(inicial, {
      fase: 'FASE_PRINCIPAL',
      pasoPreparacion: 6,
      edificios: { [verticeLibre.id]: { dueno: jugador, tipo: 'POBLADO' } },
      jugadores: inicial.jugadores.map((j) =>
        j.id === jugador
          ? { ...j, recursos: { MADERA: 0, LADRILLO: 0, OVEJA: 0, TRIGO: 2, MINERAL: 3 } }
          : j,
      ),
    });
    expect(ayuda(mesa, principal, jugador).sitios.ciudades).toEqual([verticeLibre.id]);
  });

  it('sin recursos no hay ciudades que ofrecer', () => {
    const jugador = enTurno(inicial);
    const principal = conCambios(inicial, {
      fase: 'FASE_PRINCIPAL',
      pasoPreparacion: 6,
      edificios: { [verticeLibre.id]: { dueno: jugador, tipo: 'POBLADO' } },
    });
    expect(ayuda(mesa, principal, jugador).sitios.ciudades).toEqual([]);
  });

  it('al mover el ladrón se ofrecen todas las casillas menos donde ya está', () => {
    const jugador = enTurno(inicial);
    const moviendo = conCambios(inicial, { fase: 'MOVER_LADRON', pasoPreparacion: 6 });
    const { sitios } = ayuda(mesa, moviendo, jugador);
    const esperadas = mesa.mapa.casillas
      .filter((c) => clave(c) !== clave(moviendo.ladron!))
      .map((c) => clave(c));
    expect([...sitios.ladron].toSorted()).toEqual(esperadas.toSorted());
    expect(new Set(sitios.ladron).size).toBe(sitios.ladron.length);
  });

  it('las acciones son las mismas que da accionesDisponibles', () => {
    const jugador = enTurno(inicial);
    expect(ayuda(mesa, inicial, jugador).acciones).toEqual(
      accionesDisponibles(mesa, inicial, jugador),
    );
  });

  it('un jugador que no participa lanza un error', () => {
    expect(() => ayuda(mesa, inicial, 'intruso')).toThrow(/no participa/);
  });
});
