import { clave } from '../mapa/coordenadas.js';
import { RECURSOS, type Recurso } from '../reglas/recursos.js';
import type { Terreno } from '../reglas/tablero.js';
import type { Mesa } from './mesa.js';
import type { Estado, Evento, FuenteProduccion, JugadorId } from './tipos.js';

export const RECURSO_POR_TERRENO: Readonly<Record<Terreno, Recurso | null>> = {
  BOSQUE: 'MADERA',
  PASTO: 'OVEJA',
  CAMPO: 'TRIGO',
  COLINA: 'LADRILLO',
  MONTANA: 'MINERAL',
  DESIERTO: null,
};

const PRODUCE_POR_EDIFICIO = { POBLADO: 1, CIUDAD: 2 } as const;
const SUMA_LADRON = 7;

interface Pedido {
  cantidad: number;
  fuentes: FuenteProduccion[];
}

/** Pedidos por recurso y jugador; un `Map` conserva el orden de inserción (determinista). */
function reunirPedidos(
  mesa: Mesa,
  estado: Estado,
  suma: number,
): Map<Recurso, Map<JugadorId, Pedido>> {
  const bloqueada = estado.ladron ? clave(estado.ladron) : null;
  const pedidos = new Map<Recurso, Map<JugadorId, Pedido>>();
  for (const casilla of mesa.tablero.casillas) {
    const recurso = RECURSO_POR_TERRENO[casilla.terreno];
    if (casilla.ficha !== suma || recurso === null || clave(casilla.hex) === bloqueada) continue;
    for (const vertice of mesa.mapa.vertices) {
      const edificio = estado.edificios[vertice.id];
      if (!edificio || !vertice.casillas.some((c) => clave(c) === clave(casilla.hex))) continue;
      const cantidad = PRODUCE_POR_EDIFICIO[edificio.tipo];
      const porJugador = pedidos.get(recurso) ?? new Map<JugadorId, Pedido>();
      const pedido = porJugador.get(edificio.dueno) ?? { cantidad: 0, fuentes: [] };
      pedido.cantidad += cantidad;
      pedido.fuentes.push({
        casilla: clave(casilla.hex),
        vertice: vertice.id,
        edificio: edificio.tipo,
        cantidad,
      });
      porJugador.set(edificio.dueno, pedido);
      pedidos.set(recurso, porJugador);
    }
  }
  return pedidos;
}

/**
 * Reparte la producción de una tirada. Banco corto (reglamento oficial de Catan): si el banco no
 * alcanza para todos los que esperan un recurso, nadie lo cobra; la excepción es que solo un
 * jugador lo espere, que recibe lo que quede.
 */
export function repartirProduccion(mesa: Mesa, estado: Estado, suma: number): readonly Evento[] {
  if (suma === SUMA_LADRON) return [];
  const pedidos = reunirPedidos(mesa, estado, suma);
  const eventos: Evento[] = [];
  for (const recurso of RECURSOS) {
    const porJugador = pedidos.get(recurso);
    if (!porJugador) continue;
    const total = [...porJugador.values()].reduce((s, p) => s + p.cantidad, 0);
    const disponible = estado.banco[recurso];
    if (total > disponible && porJugador.size > 1) {
      eventos.push({ tipo: 'PRODUCCION_BLOQUEADA', recurso, pedido: total, disponible });
      continue;
    }
    for (const [jugador, pedido] of porJugador) {
      const cantidad = Math.min(pedido.cantidad, disponible);
      if (cantidad === 0) continue;
      eventos.push({
        tipo: 'RECURSOS_REPARTIDOS',
        jugador,
        recurso,
        cantidad,
        causa: { tipo: 'PRODUCCION', tirada: suma, fuentes: pedido.fuentes },
      });
    }
  }
  return eventos;
}
