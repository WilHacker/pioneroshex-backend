import { z } from 'zod';

export const NOMBRE_CUENTA_MIN = 3;
export const NOMBRE_CUENTA_MAX = 20;
export const CONTRASENA_MIN = 8;
/** Un máximo evita que alguien mande contraseñas enormes para gastar CPU en `scrypt`. */
export const CONTRASENA_MAX = 128;

/** Letras (con tildes), números, espacio, guion y guion bajo; sin caracteres de control. */
const nombreCuenta = z
  .string()
  .trim()
  .min(NOMBRE_CUENTA_MIN)
  .max(NOMBRE_CUENTA_MAX)
  .regex(/^[\p{L}\p{N} _-]+$/u, 'Solo letras, números, espacios, guion y guion bajo')
  // Los espacios dobles se juntan: «Ana  López» y «Ana López» son el mismo nombre.
  .transform((texto) => texto.replace(/\s+/g, ' '));

/** Sin recortar ni exigir mezclas raras: lo que importa es el largo. */
const contrasenaNueva = z.string().min(CONTRASENA_MIN).max(CONTRASENA_MAX);

export const esquemaRegistro = z.strictObject({
  nombre: nombreCuenta,
  contrasena: contrasenaNueva,
  /** Solo si el servidor tiene el registro cerrado. */
  codigoRegistro: z.string().max(100).optional(),
});

/** Al entrar no se repite la política: así un error no revela qué reglas tiene el nombre. */
export const esquemaEntrar = z.strictObject({
  nombre: z.string().trim().min(1).max(NOMBRE_CUENTA_MAX),
  contrasena: z.string().min(1).max(CONTRASENA_MAX),
});

export const esquemaRecuperar = z.strictObject({
  nombre: z.string().trim().min(1).max(NOMBRE_CUENTA_MAX),
  codigo: z.string().trim().min(1).max(30),
  nuevaContrasena: contrasenaNueva,
});

export const esquemaCambiarContrasena = z.strictObject({
  actual: z.string().min(1).max(CONTRASENA_MAX),
  nueva: contrasenaNueva,
});

/** Para lo delicado (códigos nuevos, borrar la cuenta): se vuelve a pedir la contraseña. */
export const esquemaConContrasena = z.strictObject({
  contrasena: z.string().min(1).max(CONTRASENA_MAX),
});

export type RegistroEntrada = z.infer<typeof esquemaRegistro>;
export type EntrarEntrada = z.infer<typeof esquemaEntrar>;
