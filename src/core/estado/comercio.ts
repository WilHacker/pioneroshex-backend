import { mejorRazon } from '../reglas/puertos.js';
import { RECURSOS, type Recurso } from '../reglas/recursos.js';
import type { Mesa } from './mesa.js';
import type { Accion, Decision, Estado, Evento } from './tipos.js';

type Mano = Partial<Record<Recurso, number>>;
type Linea = readonly [Recurso, number];

/**
 * Los recursos con cantidad de una mano, en el orden de siempre, o `null` si trae un recurso que no
 * existe o una cantidad que no es un entero de 0 en adelante. Lo que llega de un cliente no es de fiar.
 */
function lineasDe(mano: Mano): Linea[] | null {
  const claves = Object.keys(mano);
  if (claves.some((c) => !(RECURSOS as readonly string[]).includes(c))) return null;
  const lineas: Linea[] = [];
  for (const recurso of RECURSOS) {
    const cantidad = mano[recurso] ?? 0;
    if (!Number.isInteger(cantidad) || cantidad < 0) return null;
    if (cantidad > 0) lineas.push([recurso, cantidad]);
  }
  return lineas;
}

const suma = (lineas: readonly Linea[]): number => lineas.reduce((s, [, c]) => s + c, 0);

/**
 * Valida un cambio con la banca: una razón (4:1, o 3:1 / 2:1 con puertos) o varias a la vez.
 *
 * Reglas: cada recurso que se entrega es un múltiplo de su razón (cada recurso tiene la suya, según
 * los puertos del jugador); se piden tantas cartas como cambios completos hay; no se pide un recurso
 * que también se entrega. Solo se permite en FASE_PRINCIPAL y durante el turno del jugador.
 *
 * Los eventos son uno por cambio (una razón entregada por una carta recibida): el emparejamiento es
 * arbitrario, pero la suma de todos es exactamente lo que se pidió.
 */
export function decidirCambioConBanca(mesa: Mesa, estado: Estado, accion: Accion): Decision {
  if (accion.tipo !== 'CAMBIAR_CON_BANCA') return { ok: false, motivo: 'FASE_INCORRECTA' };
  if (estado.fase !== 'FASE_PRINCIPAL') return { ok: false, motivo: 'FASE_INCORRECTA' };

  const entrega = lineasDe(accion.entrega);
  const recibe = lineasDe(accion.recibe);
  if (!entrega || !recibe) return { ok: false, motivo: 'RECURSO_INVALIDO' };

  const jugador = estado.jugadores.find((j) => j.id === accion.jugador);
  if (!jugador) return { ok: false, motivo: 'JUGADOR_DESCONOCIDO' };

  if (entrega.length === 0) return { ok: false, motivo: 'OFERTA_VACIA' };
  if (recibe.length === 0) return { ok: false, motivo: 'PETICION_VACIA' };
  if (entrega.some(([r]) => recibe.some(([otro]) => otro === r))) {
    return { ok: false, motivo: 'MISMO_RECURSO' };
  }

  const verticesPropios = new Set(
    Object.keys(estado.edificios).filter((v) => estado.edificios[v]?.dueno === accion.jugador),
  );

  // Cada recurso entregado se paga a su razón: cuántas razones completas hay en total son los cambios.
  const pagos: { recurso: Recurso; razon: number; cambios: number }[] = [];
  for (const [recurso, cantidad] of entrega) {
    const razon = mejorRazon(mesa.puertos, verticesPropios, recurso);
    if (cantidad % razon !== 0) {
      return {
        ok: false,
        motivo: 'CAMBIO_INCORRECTO',
        detalle: { recurso, requerido: razon, entregado: cantidad },
      };
    }
    pagos.push({ recurso, razon, cambios: cantidad / razon });
  }
  const cambios = pagos.reduce((s, p) => s + p.cambios, 0);
  const pedidas = suma(recibe);
  if (pedidas !== cambios) {
    return { ok: false, motivo: 'CAMBIO_INCORRECTO', detalle: { requerido: cambios, pedidas } };
  }

  const falta: Mano = {};
  for (const [recurso, cantidad] of entrega) {
    const faltan = cantidad - jugador.recursos[recurso];
    if (faltan > 0) falta[recurso] = faltan;
  }
  if (Object.keys(falta).length > 0) return { ok: false, motivo: 'RECURSOS_INSUFICIENTES', falta };

  for (const [recurso, cantidad] of recibe) {
    if (estado.banco[recurso] < cantidad) {
      return {
        ok: false,
        motivo: 'BANCO_AGOTADO',
        detalle: { recurso, pedido: cantidad, disponible: estado.banco[recurso] },
      };
    }
  }

  // Una razón por cada cambio y una carta por cada cambio, emparejadas en orden.
  const razones = pagos.flatMap((p) =>
    Array.from({ length: p.cambios }, () => ({ recurso: p.recurso, razon: p.razon })),
  );
  const cartas = recibe.flatMap(([recurso, cantidad]) =>
    Array.from({ length: cantidad }, () => recurso),
  );
  const eventos = razones.map(({ recurso, razon }, i): Evento => ({
    tipo: 'CAMBIO_CON_BANCA_REALIZADO',
    jugador: accion.jugador,
    entrega: recurso,
    cantidadEntregada: razon,
    recibe: cartas[i]!,
    cantidadRecibida: 1,
  }));
  return { ok: true, eventos };
}
