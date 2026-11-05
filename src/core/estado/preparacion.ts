import { clave } from '../mapa/coordenadas.js';
import { RECURSO_POR_TERRENO } from './produccion.js';
import { puedeColocarPoblado } from './conectividad.js';
import type { Mesa } from './mesa.js';
import type { Accion, Decision, Estado, Evento } from './tipos.js';

/** Orden de ida y vuelta: pasos 0..n-1 juegan 0..n-1; pasos n..2n-1 juegan n-1..0. */
export function jugadorDelPaso(paso: number, jugadores: number): number {
  return paso < jugadores ? paso : 2 * jugadores - 1 - paso;
}

/** Un recurso por cada casilla productiva que toca el vértice (solo en la segunda vuelta). */
function recursosIniciales(mesa: Mesa, jugador: string, vertice: string): Evento[] {
  const eventos: Evento[] = [];
  for (const hex of mesa.vertice(vertice)?.casillas ?? []) {
    const casilla = mesa.tablero.casillas.find((c) => clave(c.hex) === clave(hex));
    const recurso = casilla ? RECURSO_POR_TERRENO[casilla.terreno] : null;
    if (!casilla || recurso === null) continue;
    eventos.push({
      tipo: 'RECURSOS_REPARTIDOS',
      jugador,
      recurso,
      cantidad: 1,
      pedido: 1,
      recortado: 0,
      causa: { tipo: 'PREPARACION', vertice, casilla: clave(hex) },
    });
  }
  return eventos;
}

function colocarPoblado(mesa: Mesa, estado: Estado, jugador: string, vertice: string): Decision {
  if (estado.fase !== 'PREPARACION_POBLADO') return { ok: false, motivo: 'FASE_INCORRECTA' };
  if (!mesa.vertice(vertice)) return { ok: false, motivo: 'VERTICE_INEXISTENTE' };
  const regla = puedeColocarPoblado(mesa, estado, jugador, vertice, { requiereCamino: false });
  if (!regla.ok) return regla;
  const segundaVuelta = estado.pasoPreparacion >= estado.jugadores.length;
  return {
    ok: true,
    eventos: [
      { tipo: 'POBLADO_COLOCADO', jugador, vertice, origen: 'PREPARACION', costo: {} },
      ...(segundaVuelta ? recursosIniciales(mesa, jugador, vertice) : []),
      {
        tipo: 'FASE_CAMBIADA',
        fase: 'PREPARACION_CAMINO',
        turnoDe: estado.turnoDe,
        pasoPreparacion: estado.pasoPreparacion,
      },
    ],
  };
}

function colocarCamino(mesa: Mesa, estado: Estado, jugador: string, arista: string): Decision {
  if (estado.fase !== 'PREPARACION_CAMINO' || estado.pobladoPendiente === null) {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }
  const datos = mesa.arista(arista);
  if (!datos) return { ok: false, motivo: 'ARISTA_INEXISTENTE' };
  const duenoCamino = estado.caminos[arista];
  if (duenoCamino !== undefined) {
    return { ok: false, motivo: 'ARISTA_OCUPADA', detalle: { dueno: duenoCamino } };
  }
  if (!datos.vertices.includes(estado.pobladoPendiente)) {
    return {
      ok: false,
      motivo: 'CAMINO_NO_ADYACENTE',
      detalle: { pobladoPendiente: estado.pobladoPendiente },
    };
  }
  const paso = estado.pasoPreparacion + 1;
  const total = 2 * estado.jugadores.length;
  const cambio: Evento =
    paso === total
      ? { tipo: 'FASE_CAMBIADA', fase: 'PRE_TIRADA', turnoDe: 0, pasoPreparacion: paso }
      : {
          tipo: 'FASE_CAMBIADA',
          fase: 'PREPARACION_POBLADO',
          turnoDe: jugadorDelPaso(paso, estado.jugadores.length),
          pasoPreparacion: paso,
        };
  return {
    ok: true,
    eventos: [
      { tipo: 'CAMINO_COLOCADO', jugador, arista, origen: 'PREPARACION', costo: {} },
      cambio,
    ],
  };
}

/** Decide las acciones de la preparación; el resto de tipos no pertenece a esta fase. */
export function decidirPreparacion(mesa: Mesa, estado: Estado, accion: Accion): Decision {
  switch (accion.tipo) {
    case 'COLOCAR_POBLADO_INICIAL':
      return colocarPoblado(mesa, estado, accion.jugador, accion.vertice);
    case 'COLOCAR_CAMINO_INICIAL':
      return colocarCamino(mesa, estado, accion.jugador, accion.arista);
    default:
      return { ok: false, motivo: 'FASE_INCORRECTA' };
  }
}
