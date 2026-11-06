import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';

// Parámetros recomendados por OWASP para scrypt con poca memoria (N=2^14, r=8, p=1).
const COSTE_N = 16384;
const BLOQUE_R = 8;
const PARALELO_P = 1;
const LARGO_CLAVE = 64;
const LARGO_SAL = 16;
const MAXMEM = 64 * 1024 * 1024;
/** Un hash guardado no puede pedir más coste que este: protege de uno manipulado. */
const COSTE_N_MAX = 2 ** 17;

/** Cuántos scrypt corren a la vez: cada uno usa 16 MB y un hilo del grupo de hilos de Node. */
const SIMULTANEOS_MAX = 4;
/** Cuántos esperan su turno; pasado esto se responde 503 en vez de acumular sin fin. */
const EN_COLA_MAX = 64;
let activos = 0;
const cola: (() => void)[] = [];

/** Deja correr `tarea` si hay cupo, la hace esperar si hay cola corta y rechaza si hay demasiada. */
async function conCupo<T>(tarea: () => Promise<T>): Promise<T> {
  if (activos >= SIMULTANEOS_MAX) {
    if (cola.length >= EN_COLA_MAX) {
      throw new ServiceUnavailableException('El servidor está ocupado, prueba en un momento');
    }
    // Al despertar, quien terminó nos traspasó su cupo: `activos` no cambia.
    await new Promise<void>((despertar) => cola.push(despertar));
  } else {
    activos += 1;
  }
  try {
    return await tarea();
  } finally {
    const siguiente = cola.shift();
    if (siguiente) siguiente();
    else activos -= 1;
  }
}

function derivar(
  contrasena: string,
  sal: Buffer,
  n: number,
  r: number,
  p: number,
  largo: number,
): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    scrypt(contrasena, sal, largo, { N: n, r, p, maxmem: MAXMEM }, (error, clave) => {
      if (error) rechazar(error);
      else resolver(clave);
    });
  });
}

/** `scrypt$N$r$p$sal$clave`: los parámetros viajan en el hash para poder subirlos más adelante. */
export async function hashContrasena(contrasena: string): Promise<string> {
  const sal = randomBytes(LARGO_SAL);
  const clave = await conCupo(() =>
    derivar(contrasena, sal, COSTE_N, BLOQUE_R, PARALELO_P, LARGO_CLAVE),
  );
  return `scrypt$${COSTE_N}$${BLOQUE_R}$${PARALELO_P}$${sal.toString('base64url')}$${clave.toString('base64url')}`;
}

/** Nunca lanza: un hash ilegible o con parámetros absurdos simplemente no verifica. */
export async function verificarContrasena(contrasena: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const n = Number(partes[1]);
  const r = Number(partes[2]);
  const p = Number(partes[3]);
  const esperada = Buffer.from(partes[5] ?? '', 'base64url');
  const sal = Buffer.from(partes[4] ?? '', 'base64url');
  const valido =
    Number.isInteger(n) && n >= 2 && n <= COSTE_N_MAX && (n & (n - 1)) === 0 && r === BLOQUE_R;
  if (!valido || !Number.isInteger(p) || p < 1 || p > 4 || sal.length === 0) return false;
  if (esperada.length === 0) return false;
  try {
    const obtenida = await conCupo(() => derivar(contrasena, sal, n, r, p, esperada.length));
    return timingSafeEqual(obtenida, esperada);
  } catch (error: unknown) {
    // Que el servidor esté saturado no es una contraseña incorrecta: se avisa tal cual.
    if (error instanceof ServiceUnavailableException) throw error;
    return false;
  }
}
