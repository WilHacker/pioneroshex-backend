import { z } from 'zod';

// Mensajes de validación de Zod en español.
z.config(z.locales.es());

export const esquemaEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().startsWith('postgresql://', 'debe empezar con postgresql://'),
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  // Uno o varios orígenes separados por comas (para entrar desde otros dispositivos de la casa).
  FRONTEND_URL: z
    .string()
    .transform((texto) =>
      texto
        .split(',')
        .map((origen) => origen.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url()).min(1)),
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
