import type { Mesa } from '../estado/mesa.js';
import type { Estado } from '../estado/tipos.js';
import { puntosDe } from '../estado/puntos.js';
import { limitesDePiezas, type LimitesDePiezas } from '../reglas/costos.js';
import { composicionDelMazo, type CartaDesarrollo } from '../reglas/mazo.js';
import { RECURSOS } from '../reglas/recursos.js';

/*
 * Comprobaciones calculadas a partir del estado, sin pasar por las funciones que validan las
 * jugadas (`decidir`, `conectividad`, `distancia`). Los límites de piezas (`limitesDePiezas`) y la
 * lista de recursos vienen de la misma fuente que usa el motor; el banco inicial se recalcula aquí.
 * Cada violación es un código `NOMBRE:detalle`.
 */

// Banco provisional del diseño: 19 por recurso por cada 4 jugadores (redondeando hacia arriba).
const CARTAS_POR_RECURSO = 19;
const JUGADORES_POR_BANCO = 4;

function recursosConstantes(estado: Estado): string[] {
  const inicial = CARTAS_POR_RECURSO * Math.ceil(estado.jugadores.length / JUGADORES_POR_BANCO);
  return RECURSOS.filter(
    (r) => estado.banco[r] + estado.jugadores.reduce((s, j) => s + j.recursos[r], 0) !== inicial,
  ).map((r) => `RECURSOS_DESCUADRADOS:${r}`);
}

function recursosNoNegativos(estado: Estado): string[] {
  const manos = [{ id: 'banco', recursos: estado.banco }, ...estado.jugadores];
  return manos.flatMap(({ id, recursos }) =>
    RECURSOS.filter((r) => recursos[r] < 0).map((r) => `RECURSO_NEGATIVO:${id}:${r}`),
  );
}

/** Restantes + colocadas = límite. Una ciudad cuenta como ciudad, no como poblado. */
function piezasCuadran(estado: Estado): string[] {
  const limites = limitesDePiezas(estado.jugadores.length);
  const edificios = Object.values(estado.edificios);
  const caminos = Object.values(estado.caminos);
  return estado.jugadores.flatMap(({ id, piezasRestantes }) => {
    const colocadas: LimitesDePiezas = {
      caminos: caminos.filter((d) => d === id).length,
      poblados: edificios.filter((e) => e.dueno === id && e.tipo === 'POBLADO').length,
      ciudades: edificios.filter((e) => e.dueno === id && e.tipo === 'CIUDAD').length,
    };
    return (Object.keys(limites) as (keyof LimitesDePiezas)[])
      .filter((p) => piezasRestantes[p] + colocadas[p] !== limites[p])
      .map((p) => `PIEZAS_DESCUADRADAS:${id}:${p}`);
  });
}

function sinEdificiosVecinos(mesa: Mesa, estado: Estado): string[] {
  return Object.keys(estado.edificios).flatMap((v) => {
    const vertice = mesa.vertice(v);
    if (!vertice) return [`VERTICE_INEXISTENTE:${v}`];
    return vertice.vecinos
      .filter((w) => w in estado.edificios)
      .map((w) => `EDIFICIOS_VECINOS:${v}:${w}`);
  });
}

/**
 * Cada camino toca, en algún extremo, un edificio propio u otro camino propio. Límites conocidos:
 * pasa un camino que conecta solo a través de un edificio rival (el corte) y pasan dos caminos
 * sueltos que solo se tocan entre sí. El corte lo cubre `estado/conectividad.spec.ts`.
 */
function caminosConectados(mesa: Mesa, estado: Estado): string[] {
  const entradas = Object.entries(estado.caminos);
  return entradas.flatMap(([id, dueno]) => {
    const arista = mesa.arista(id);
    if (!arista) return [`ARISTA_INEXISTENTE:${id}`];
    const toca = arista.vertices.some(
      (v) =>
        estado.edificios[v]?.dueno === dueno ||
        entradas.some(
          ([otro, d]) => otro !== id && d === dueno && mesa.arista(otro)?.vertices.includes(v),
        ),
    );
    return toca ? [] : [`CAMINO_SUELTO:${id}`];
  });
}

function turnoYGanador(estado: Estado): string[] {
  const violaciones: string[] = [];
  const { turnoDe, jugadores, ganador, fase } = estado;
  if (!Number.isInteger(turnoDe) || turnoDe < 0 || turnoDe >= jugadores.length) {
    violaciones.push(`TURNO_INVALIDO:${turnoDe}`);
  }
  if ((ganador !== null) !== (fase === 'FIN')) {
    violaciones.push(`GANADOR_INCOHERENTE:${fase}:${ganador}`);
  }
  return violaciones;
}

function granEjercitoCoherente(estado: Estado): string[] {
  if (estado.granEjercito === null) return [];
  const titular = estado.jugadores.find((j) => j.id === estado.granEjercito);
  if (!titular) return [`GRAN_EJERCITO_TITULAR_INEXISTENTE:${estado.granEjercito}`];
  if (titular.caballerosJugados < 3) {
    return [`GRAN_EJERCITO_INSUFICIENTE:${titular.id}:${titular.caballerosJugados}`];
  }
  const superado = estado.jugadores.find((j) => j.caballerosJugados > titular.caballerosJugados);
  if (superado) {
    return [`GRAN_EJERCITO_SUPERADO:${titular.id}:${superado.id}`];
  }
  return [];
}

function granRutaCoherente(estado: Estado): string[] {
  if (estado.granRuta === null) return [];
  const titular = estado.jugadores.find((j) => j.id === estado.granRuta);
  if (!titular) return [`GRAN_RUTA_TITULAR_INEXISTENTE:${estado.granRuta}`];
  if (estado.longitudGranRuta < 5) {
    return [`GRAN_RUTA_LONGITUD_INSUFICIENTE:${titular.id}:${estado.longitudGranRuta}`];
  }
  return [];
}

/** El ganador tiene, contando sus cartas ocultas, al menos los puntos de victoria de la partida. */
function ganadorAlcanzaMeta(estado: Estado): string[] {
  if (estado.ganador === null) return [];
  const puntos = puntosDe(estado, estado.ganador, { incluirOcultos: true });
  return puntos >= estado.config.puntosVictoria
    ? []
    : [`GANADOR_SIN_PUNTOS:${estado.ganador}:${puntos}/${estado.config.puntosVictoria}`];
}

/** Descartes pendientes solo en la fase DESCARTE, siempre alguno, y nunca más cartas que la mano. */
function descartesCoherentes(estado: Estado): string[] {
  const pendientes = Object.entries(estado.descartesPendientes);
  const violaciones: string[] = [];
  if ((estado.fase === 'DESCARTE') !== pendientes.length > 0) {
    violaciones.push(`DESCARTES_INCOHERENTES:${estado.fase}:${pendientes.length}`);
  }
  for (const [id, cantidad] of pendientes) {
    const jugador = estado.jugadores.find((j) => j.id === id);
    const mano = jugador ? RECURSOS.reduce((s, r) => s + jugador.recursos[r], 0) : 0;
    if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > mano) {
      violaciones.push(`DESCARTE_IMPOSIBLE:${id}:${cantidad}/${mano}`);
    }
  }
  return violaciones;
}

/**
 * Las cartas de desarrollo no se crean de la nada: mazo + manos + caballeros jugados no superan
 * la composición del mazo. Los caballeros nunca se gastan (quedan contados en `caballerosJugados`),
 * así que ahí la suma es exacta; las demás cartas se gastan al jugarse y solo pueden sobrar.
 */
function cartasDesarrolloCuadran(estado: Estado): string[] {
  const total = composicionDelMazo(estado.jugadores.length);
  const enMano = (carta: CartaDesarrollo): number =>
    estado.jugadores.reduce(
      (s, j) =>
        s +
        j.cartasDesarrollo.filter((c) => c === carta).length +
        j.cartasCompradasEsteTurno.filter((c) => c === carta).length,
      0,
    );
  const enMazo = (carta: CartaDesarrollo): number => estado.mazo.filter((c) => c === carta).length;
  const jugados = estado.jugadores.reduce((s, j) => s + j.caballerosJugados, 0);
  const violaciones: string[] = [];
  const caballeros = enMazo('CABALLERO') + enMano('CABALLERO') + jugados;
  if (caballeros !== total.CABALLERO) {
    violaciones.push(`CABALLEROS_DESCUADRADOS:${caballeros}/${total.CABALLERO}`);
  }
  for (const carta of Object.keys(total) as CartaDesarrollo[]) {
    if (carta !== 'CABALLERO' && enMazo(carta) + enMano(carta) > total[carta]) {
      violaciones.push(`CARTA_SOBRANTE:${carta}`);
    }
  }
  return violaciones;
}

/** Lista de violaciones de las invariantes del estado; vacía si todo cuadra. No muta nada. */
export function verificarInvariantes(mesa: Mesa, estado: Estado): readonly string[] {
  return [
    ...recursosConstantes(estado),
    ...recursosNoNegativos(estado),
    ...piezasCuadran(estado),
    ...sinEdificiosVecinos(mesa, estado),
    ...caminosConectados(mesa, estado),
    ...turnoYGanador(estado),
    ...granEjercitoCoherente(estado),
    ...granRutaCoherente(estado),
    ...ganadorAlcanzaMeta(estado),
    ...descartesCoherentes(estado),
    ...cartasDesarrolloCuadran(estado),
  ];
}
