import { z } from 'zod';
import { PUNTOS_VICTORIA_MIN } from '../core/partida/game-config.js';

const NOMBRE_MAX = 20;
const PUNTOS_VICTORIA_MAX = 20;
const SEMILLA_MAX = 40;

/** Texto corto sin caracteres de control (saltos de línea, etc.) que se muestra a otros jugadores. */
const nombre = z
  .string()
  .trim()
  .min(1)
  .max(NOMBRE_MAX)
  .regex(/^[^\p{Cc}]+$/u, 'No puede llevar caracteres de control');

export const esquemaCrearSala = z.strictObject({ nombre });
export const esquemaUnirse = z.strictObject({ nombre });

/** Lo que el anfitrión puede fijar al empezar. `semillaAzar` no está: la genera el servidor. */
export const esquemaEmpezar = z.strictObject({
  puntosVictoria: z.number().int().min(PUNTOS_VICTORIA_MIN).max(PUNTOS_VICTORIA_MAX).optional(),
  turnRuleMode: z.enum(['A', 'B']).optional(),
  modoDados: z.enum(['AZAR', 'EQUILIBRADO']).optional(),
  semillaMapa: z.string().trim().min(1).max(SEMILLA_MAX).optional(),
});

export type CrearSalaEntrada = z.infer<typeof esquemaCrearSala>;
export type UnirseEntrada = z.infer<typeof esquemaUnirse>;
export type EmpezarEntrada = z.infer<typeof esquemaEmpezar>;
