import type { Mesa } from '../estado/mesa.js';
import type { Estado } from '../estado/tipos.js';
import { limitesDePiezas, type LimitesDePiezas } from '../reglas/costos.js';
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

/** Lista de violaciones de las invariantes del estado; vacía si todo cuadra. No muta nada. */
export function verificarInvariantes(mesa: Mesa, estado: Estado): readonly string[] {
  return [
    ...recursosConstantes(estado),
    ...recursosNoNegativos(estado),
    ...piezasCuadran(estado),
    ...sinEdificiosVecinos(mesa, estado),
    ...caminosConectados(mesa, estado),
    ...turnoYGanador(estado),
  ];
}
