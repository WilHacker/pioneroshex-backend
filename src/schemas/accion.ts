import { z } from 'zod';
import type { Accion, JugadorId } from '../core/estado/tipos.js';
import { RECURSOS } from '../core/reglas/recursos.js';

/** Tope de longitud para ids de vértice, arista, trato y jugador que llegan de un cliente. */
const LARGO_MAX_ID = 80;
/** Más de esto en una sola jugada no es una jugada: es un intento de colar basura al motor. */
const CANTIDAD_MAX = 100;

const id = z.string().min(1).max(LARGO_MAX_ID);
const recurso = z.enum(RECURSOS);
const cantidades = z.partialRecord(recurso, z.number().int().min(0).max(CANTIDAD_MAX));
const casilla = z
  .strictObject({ q: z.number().int(), r: z.number().int(), s: z.number().int() })
  .refine((h) => h.q + h.r + h.s === 0, { message: 'Una casilla cúbica cumple q + r + s = 0' });

/** Cada acción, sin `jugador`: ese campo lo pone el servidor desde la sesión, nunca el cliente. */
const sinCampos = (tipo: string) => z.strictObject({ tipo: z.literal(tipo) });

/**
 * Las acciones que un cliente puede pedir. Quedan fuera `DESCARTE_AUTOMATICO` y
 * `SALTAR_TURNO_POR_INACTIVIDAD`: son del reloj del servidor y un jugador no debe poder lanzarlas.
 */
export const esquemaAccionEntrante = z.discriminatedUnion('tipo', [
  z.strictObject({ tipo: z.literal('COLOCAR_POBLADO_INICIAL'), vertice: id }),
  z.strictObject({ tipo: z.literal('COLOCAR_CAMINO_INICIAL'), arista: id }),
  sinCampos('TIRAR_DADOS'),
  z.strictObject({ tipo: z.literal('DESCARTAR_RECURSOS'), recursos: cantidades }),
  z.strictObject({ tipo: z.literal('MOVER_LADRON'), destino: casilla, victima: id.nullable() }),
  z.strictObject({ tipo: z.literal('CONSTRUIR_CAMINO'), arista: id }),
  z.strictObject({ tipo: z.literal('CONSTRUIR_POBLADO'), vertice: id }),
  z.strictObject({ tipo: z.literal('CONSTRUIR_CIUDAD'), vertice: id }),
  z.strictObject({ tipo: z.literal('CAMBIAR_CON_BANCA'), entrega: recurso, recibe: recurso }),
  z.strictObject({
    tipo: z.literal('PROPONER_TRATO'),
    entrega: cantidades,
    pide: cantidades,
    destinatario: id.nullable().optional(),
  }),
  z.strictObject({ tipo: z.literal('ACEPTAR_TRATO'), tratoId: id }),
  z.strictObject({ tipo: z.literal('RECHAZAR_TRATO'), tratoId: id }),
  z.strictObject({ tipo: z.literal('CANCELAR_TRATO'), tratoId: id }),
  z.strictObject({
    tipo: z.literal('CONTRAOFERTAR_TRATO'),
    tratoIdOriginal: id,
    entrega: cantidades,
    pide: cantidades,
  }),
  sinCampos('PASAR_CONSTRUCCION_ESPECIAL'),
  sinCampos('COMPRAR_CARTA_DESARROLLO'),
  z.strictObject({ tipo: z.literal('JUGAR_CABALLERO'), destino: casilla, victima: id.nullable() }),
  z.strictObject({
    tipo: z.literal('JUGAR_CONSTRUCCION_CARRETERAS'),
    aristas: z.union([z.tuple([id]), z.tuple([id, id])]),
  }),
  z.strictObject({ tipo: z.literal('JUGAR_ABUNDANCIA'), recursos: z.tuple([recurso, recurso]) }),
  z.strictObject({ tipo: z.literal('JUGAR_MONOPOLIO'), recurso }),
  sinCampos('TERMINAR_TURNO'),
  sinCampos('ABANDONAR'),
]);

export type AccionEntrante = z.infer<typeof esquemaAccionEntrante>;

/** Convierte lo que mandó el cliente en una acción del motor, a nombre del jugador autenticado. */
export function accionDeJugador(entrante: AccionEntrante, jugador: JugadorId): Accion {
  // El esquema replica la forma de `Accion` sin `jugador`; Zod no puede probárselo a TypeScript.
  return { ...entrante, jugador } as Accion;
}
