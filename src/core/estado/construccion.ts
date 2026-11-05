import { COSTOS, type Costo, type LimitesDePiezas, type Pieza } from '../reglas/costos.js';
import type { Recurso } from '../reglas/recursos.js';
import { puedeColocarCamino, puedeColocarPoblado } from './conectividad.js';
import { evaluarGranRuta } from './gran-ruta.js';
import type { Mesa } from './mesa.js';
import { puntosDe } from './puntos.js';
import type { Accion, Decision, Estado, Evento, ResultadoRegla } from './tipos.js';

/*
 * Orden de comprobaciones (se devuelve el primer motivo que falla):
 *   1. FASE_INCORRECTA        solo en FASE_PRINCIPAL
 *   2. SIN_PIEZAS             la reserva de esa pieza (caminos | poblados | ciudades) es 0
 *   3. RECURSOS_INSUFICIENTES con `falta` = lo que le falta de cada recurso
 *   4. posición               camino: puedeColocarCamino · poblado: puedeColocarPoblado con
 *                             camino propio · ciudad: VERTICE_INEXISTENTE o NO_ES_TU_POBLADO
 * Tras un poblado o una ciudad, si los puntos llegan a `puntosVictoria`, se añade PARTIDA_GANADA.
 */

type AccionConstruir = Extract<
  Accion,
  { tipo: 'CONSTRUIR_CAMINO' | 'CONSTRUIR_POBLADO' | 'CONSTRUIR_CIUDAD' }
>;

const PIEZA_DE: Readonly<
  Record<AccionConstruir['tipo'], { pieza: Pieza; reserva: keyof LimitesDePiezas }>
> = {
  CONSTRUIR_CAMINO: { pieza: 'CAMINO', reserva: 'caminos' },
  CONSTRUIR_POBLADO: { pieza: 'POBLADO', reserva: 'poblados' },
  CONSTRUIR_CIUDAD: { pieza: 'CIUDAD', reserva: 'ciudades' },
};

const esConstruccion = (accion: Accion): accion is AccionConstruir =>
  Object.hasOwn(PIEZA_DE, accion.tipo);

/** Lo que falta de cada recurso para pagar el costo, o null si alcanza. */
function faltaPara(recursos: Readonly<Record<Recurso, number>>, costo: Costo): Costo | null {
  const falta = Object.entries(costo)
    .map(([recurso, n]) => [recurso, n - recursos[recurso as Recurso]] as const)
    .filter(([, diferencia]) => diferencia > 0);
  return falta.length > 0 ? Object.fromEntries(falta) : null;
}

function validarPosicion(mesa: Mesa, estado: Estado, accion: AccionConstruir): ResultadoRegla {
  switch (accion.tipo) {
    case 'CONSTRUIR_CAMINO':
      return puedeColocarCamino(mesa, estado, accion.jugador, accion.arista);
    case 'CONSTRUIR_POBLADO':
      return puedeColocarPoblado(mesa, estado, accion.jugador, accion.vertice, {
        requiereCamino: true,
      });
    case 'CONSTRUIR_CIUDAD': {
      if (!mesa.vertice(accion.vertice)) return { ok: false, motivo: 'VERTICE_INEXISTENTE' };
      const edificio = estado.edificios[accion.vertice];
      return edificio?.dueno === accion.jugador && edificio.tipo === 'POBLADO'
        ? { ok: true }
        : { ok: false, motivo: 'NO_ES_TU_POBLADO' };
    }
  }
}

function colocacion(accion: AccionConstruir, costo: Costo): Evento {
  const { jugador } = accion;
  switch (accion.tipo) {
    case 'CONSTRUIR_CAMINO':
      return {
        tipo: 'CAMINO_COLOCADO',
        jugador,
        arista: accion.arista,
        origen: 'CONSTRUCCION',
        costo,
      };
    case 'CONSTRUIR_POBLADO':
      return {
        tipo: 'POBLADO_COLOCADO',
        jugador,
        vertice: accion.vertice,
        origen: 'CONSTRUCCION',
        costo,
      };
    case 'CONSTRUIR_CIUDAD':
      return { tipo: 'CIUDAD_COLOCADA', jugador, vertice: accion.vertice, costo };
  }
}

/** Poblado y ciudad suman 1 punto; si con eso se alcanza la meta, la partida se gana. */
function victoria(estado: Estado, accion: AccionConstruir, puntosExtra = 0): Evento[] {
  const puntosPorEdificio = accion.tipo === 'CONSTRUIR_CAMINO' ? 0 : 1;
  const puntos =
    puntosDe(estado, accion.jugador, { incluirOcultos: true }) + puntosPorEdificio + puntosExtra;
  return puntos >= estado.config.puntosVictoria
    ? [{ tipo: 'PARTIDA_GANADA', jugador: accion.jugador, puntos }]
    : [];
}

/** Construye un camino, un poblado o una ciudad pagando su costo (ver el orden arriba). */
export function decidirConstruccion(mesa: Mesa, estado: Estado, accion: Accion): Decision {
  if (
    !esConstruccion(accion) ||
    (estado.fase !== 'FASE_PRINCIPAL' && estado.fase !== 'CONSTRUCCION_ESPECIAL')
  ) {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }
  const jugador = estado.jugadores.find((j) => j.id === accion.jugador);
  if (!jugador) return { ok: false, motivo: 'JUGADOR_DESCONOCIDO' };
  const { pieza, reserva } = PIEZA_DE[accion.tipo];
  if (jugador.piezasRestantes[reserva] <= 0) return { ok: false, motivo: 'SIN_PIEZAS' };
  const costo = COSTOS[pieza];
  const falta = faltaPara(jugador.recursos, costo);
  if (falta) return { ok: false, motivo: 'RECURSOS_INSUFICIENTES', falta };
  const posicion = validarPosicion(mesa, estado, accion);
  if (!posicion.ok) return posicion;

  const eventos: Evento[] = [colocacion(accion, { ...costo })];
  let puntosExtra = 0;

  if (accion.tipo === 'CONSTRUIR_CAMINO') {
    const estadoSimulado: Estado = {
      ...estado,
      caminos: { ...estado.caminos, [accion.arista]: accion.jugador },
    };
    const resRuta = evaluarGranRuta(mesa, estadoSimulado);
    if (resRuta.titular !== estado.granRuta) {
      eventos.push({
        tipo: 'GRAN_RUTA_CAMBIADA',
        titularAnterior: estado.granRuta,
        nuevoTitular: resRuta.titular,
        longitud: resRuta.longitud,
      });
      if (resRuta.titular === accion.jugador) puntosExtra += 2;
      if (estado.granRuta === accion.jugador && resRuta.titular !== accion.jugador)
        puntosExtra -= 2;
    }
  } else if (accion.tipo === 'CONSTRUIR_POBLADO') {
    const estadoSimulado: Estado = {
      ...estado,
      edificios: {
        ...estado.edificios,
        [accion.vertice]: { dueno: accion.jugador, tipo: 'POBLADO' },
      },
    };
    const resRuta = evaluarGranRuta(mesa, estadoSimulado);
    if (resRuta.titular !== estado.granRuta) {
      eventos.push({
        tipo: 'GRAN_RUTA_CAMBIADA',
        titularAnterior: estado.granRuta,
        nuevoTitular: resRuta.titular,
        longitud: resRuta.longitud,
      });
      if (resRuta.titular === accion.jugador) puntosExtra += 2;
      if (estado.granRuta === accion.jugador && resRuta.titular !== accion.jugador)
        puntosExtra -= 2;
    }
  }

  eventos.push(...victoria(estado, accion, puntosExtra));
  return { ok: true, eventos };
}
