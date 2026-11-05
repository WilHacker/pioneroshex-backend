import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

/** Valida lo que llega de fuera con su esquema Zod; si no cuadra, responde 400 con el porqué. */
export function validar<T extends z.ZodType>(esquema: T, entrada: unknown): z.infer<T> {
  const resultado = esquema.safeParse(entrada);
  if (resultado.success) return resultado.data;
  const detalle = resultado.error.issues
    .map((problema) => `${problema.path.join('.') || 'cuerpo'}: ${problema.message}`)
    .join('; ');
  throw new BadRequestException(detalle);
}
