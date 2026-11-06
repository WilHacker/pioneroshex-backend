import { z } from 'zod';
import { PUNTOS_VICTORIA_MIN } from '../core/partida/game-config.js';

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

export const esquemaCrearSala = z.strictObject({ nombre, publica: z.boolean().optional() });
export const esquemaUnirse = z.strictObject({ nombre });

/** Las reglas que el anfitrión puede fijar. `semillaAzar` no está: la genera el servidor. */
const reglas = {
  puntosVictoria: z.number().int().min(PUNTOS_VICTORIA_MIN).max(PUNTOS_VICTORIA_MAX).optional(),
  turnRuleMode: z.enum(['A', 'B']).optional(),
  modoDados: z.enum(['AZAR', 'EQUILIBRADO']).optional(),
  robberHandLimit: z.number().int().min(LIMITE_DESCARTE_MIN).max(LIMITE_DESCARTE_MAX).optional(),
  semillaMapa: z.string().trim().min(1).max(SEMILLA_MAX).optional(),
};

export const esquemaEmpezar = z.strictObject(reglas);

/** Lo que el anfitrión cambia en la sala de espera: la visibilidad y las reglas. */
export const esquemaCambiarSala = z.strictObject({ publica: z.boolean().optional(), ...reglas });

export type CrearSalaEntrada = z.infer<typeof esquemaCrearSala>;
export type UnirseEntrada = z.infer<typeof esquemaUnirse>;
export type EmpezarEntrada = z.infer<typeof esquemaEmpezar>;
export type CambiarSalaEntrada = z.infer<typeof esquemaCambiarSala>;
