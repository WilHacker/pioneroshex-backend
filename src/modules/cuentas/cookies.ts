export const NOMBRE_COOKIE = 'pioneros_sesion';
const MAX_AGE_SEGUNDOS = 30 * 24 * 60 * 60;

/** Atributos comunes: el navegador nunca la deja leer a JavaScript y no la manda desde otros sitios. */
const atributos = (seguro: boolean): string =>
  `Path=/; HttpOnly; SameSite=Lax${seguro ? '; Secure' : ''}`;

/** El valor de la cookie `nombre` en la cabecera `Cookie`, o `undefined`. */
export function leerCookie(cabecera: string | undefined, nombre: string): string | undefined {
  for (const trozo of (cabecera ?? '').split(';')) {
    const igual = trozo.indexOf('=');
    if (igual === -1 || trozo.slice(0, igual).trim() !== nombre) continue;
    try {
      return decodeURIComponent(trozo.slice(igual + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export const cookieDeSesion = (token: string, seguro: boolean): string =>
  `${NOMBRE_COOKIE}=${encodeURIComponent(token)}; Max-Age=${MAX_AGE_SEGUNDOS}; ${atributos(seguro)}`;

export const cookieDeCierre = (seguro: boolean): string =>
  `${NOMBRE_COOKIE}=; Max-Age=0; ${atributos(seguro)}`;
