import { z } from 'zod';

// Mensajes de validación de Zod en español.
z.config(z.locales.es());

export const esquemaEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().startsWith('postgresql://', 'debe empezar con postgresql://'),
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  FRONTEND_URL: z.url(),
});

export type Env = z.infer<typeof esquemaEnv>;

/** Valida las variables de entorno y falla con un mensaje claro si algo falta o es inválido. */
export function validarEnv(entrada: Record<string, unknown>): Env {
  const resultado = esquemaEnv.safeParse(entrada);
  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((problema) => `  - ${problema.path.join('.')}: ${problema.message}`)
      .join('\n');
    throw new Error(`Configuración de entorno inválida:\n${detalle}`);
  }
  return resultado.data;
}
