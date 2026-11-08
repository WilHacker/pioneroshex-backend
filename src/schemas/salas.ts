import { z } from 'zod';
import { mapaDelCatalogo } from '../core/catalogo/catalogo.js';
import {
  JUGADORES_MAX,
  JUGADORES_MIN,
  OFERTAS_POR_TURNO_MAX,
  PUNTOS_VICTORIA_MIN,
} from '../core/partida/game-config.js';

const NOMBRE_MAX = 20;
const PUNTOS_VICTORIA_MAX = 20;
const SEMILLA_MAX = 40;
const LIMITE_DESCARTE_MIN = 2;
const LIMITE_DESCARTE_MAX = 20;

/** Texto corto sin caracteres de control (saltos de línea, etc.) que se muestra a otros jugadores. */
const nombre = z
  .string()
  .trim()
  .min(1)
  .max(NOMBRE_MAX)
  .regex(/^[^\p{Cc}]+$/u, 'No puede llevar caracteres de control');

export const esquemaUnirse = z.strictObject({ nombre });

/** Las reglas que el anfitrión puede fijar. `semillaAzar` no está: la genera el servidor. */
/** Segundos por turno que se pueden elegir; 0 es sin límite. */
export const TIEMPOS_DE_TURNO = [0, 30, 60, 90, 120, 180] as const;

/**
 * El id de un mapa del catálogo (nunca casillas del cliente) o `null` para el mapa automático.
 * `mapaDelCatalogo` busca en un `Map`, así que `constructor` o `__proto__` no pasan.
 */
const mapa = z
  .string()
  .max(40)
  .refine((id) => mapaDelCatalogo(id) !== undefined, { message: 'Mapa desconocido' })
  .nullable()
  .optional();

const reglas = {
  mapa,
  puntosVictoria: z.number().int().min(PUNTOS_VICTORIA_MIN).max(PUNTOS_VICTORIA_MAX).optional(),
  turnRuleMode: z.enum(['A', 'B']).optional(),
  modoDados: z.enum(['AZAR', 'EQUILIBRADO', 'BARAJA', 'SIN_RACHAS']).optional(),
  arranqueProtegido: z.boolean().optional(),
  ocultarBanco: z.boolean().optional(),
  manosVisibles: z.boolean().optional(),
  ordenDeTurno: z.enum(['ALEATORIO', 'TIRADA', 'ENTRADA']).optional(),
  ladronAmistoso: z.boolean().optional(),
  modoComercio: z.enum(['LIBRE', 'PRIVADO', 'SOLO_BANCO']).optional(),
  maxOfertasPorTurno: z.number().int().min(0).max(OFERTAS_POR_TURNO_MAX).optional(),
  robberHandLimit: z.number().int().min(LIMITE_DESCARTE_MIN).max(LIMITE_DESCARTE_MAX).optional(),
  turnoSegundos: z
    .number()
    .refine((s): s is (typeof TIEMPOS_DE_TURNO)[number] => TIEMPOS_DE_TURNO.some((t) => t === s), {
      message: `Debe ser uno de: ${TIEMPOS_DE_TURNO.join(', ')}`,
    })
    .optional(),
  semillaMapa: z.string().trim().min(1).max(SEMILLA_MAX).optional(),
};

export const esquemaEmpezar = z.strictObject(reglas);

/** Jugadores que admite la sala. Es de la sala, no de la partida: al empezar juegan los que haya. */
const maxJugadores = z.number().int().min(JUGADORES_MIN).max(JUGADORES_MAX).optional();

/** Crear la sala ya con la visibilidad, el tope de jugadores y las reglas: una sola petición. */
export const esquemaCrearSala = z.strictObject({
  nombre,
  publica: z.boolean().optional(),
  maxJugadores,
  ...reglas,
});

/** Lo que el anfitrión cambia en la sala de espera: la visibilidad y las reglas. */
export const esquemaCambiarSala = z.strictObject({
  publica: z.boolean().optional(),
  maxJugadores,
  ...reglas,
});

/** A quién se le pasa el cargo de anfitrión. */
export const esquemaCederAnfitrion = z.strictObject({ jugadorId: z.string().min(1).max(20) });

export type CrearSalaEntrada = z.infer<typeof esquemaCrearSala>;
export type UnirseEntrada = z.infer<typeof esquemaUnirse>;
export type EmpezarEntrada = z.infer<typeof esquemaEmpezar>;
export type CambiarSalaEntrada = z.infer<typeof esquemaCambiarSala>;
