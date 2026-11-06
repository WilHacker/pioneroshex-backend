import { createHash, randomBytes } from 'node:crypto';

/** 32 símbolos sin 0, 1, I ni O: 256 es múltiplo de 32, así que `byte % 32` no sesga el azar. */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** 16 símbolos de 5 bits: 80 bits, fuera del alcance de cualquier ataque sobre el hash robado. */
const LARGO_CODIGO = 16;
const CODIGOS_POR_CUENTA = 8;
const BYTES_TOKEN = 32;

const sha256 = (texto: string): string => createHash('sha256').update(texto).digest('hex');

function unCodigo(): string {
  const bytes = randomBytes(LARGO_CODIGO);
  const letras = Array.from(bytes, (byte) => ALFABETO.charAt(byte % ALFABETO.length));
  return [0, 4, 8, 12].map((i) => letras.slice(i, i + 4).join('')).join('-');
}

/** Ocho códigos de un solo uso (80 bits cada uno) para recuperar la cuenta sin correo. */
export function generarCodigos(cantidad = CODIGOS_POR_CUENTA): string[] {
  const codigos = new Set<string>();
  while (codigos.size < cantidad) codigos.add(unCodigo());
  return [...codigos];
}

/** Sin espacios ni guiones y en mayúsculas; `null` si no puede ser un código nuestro. */
export function normalizarCodigo(texto: string): string | null {
  const limpio = texto.toUpperCase().replace(/[\s-]/g, '');
  const valido = limpio.length === LARGO_CODIGO && [...limpio].every((c) => ALFABETO.includes(c));
  return valido ? limpio : null;
}

/** Lo que se guarda de un código; con 80 bits de entropía basta un SHA-256 (no hace falta scrypt). */
export function hashCodigo(texto: string): string {
  return sha256(normalizarCodigo(texto) ?? texto);
}

/** El valor que viaja en la cookie: aleatorio y de un solo propósito. */
export const nuevoToken = (): string => randomBytes(BYTES_TOKEN).toString('base64url');

/** En la base solo se guarda esto: robar la tabla no da sesiones válidas. */
export const hashToken = (token: string): string => sha256(token);
