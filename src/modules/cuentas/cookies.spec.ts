import { describe, expect, it } from 'vitest';
import { cookieDeCierre, cookieDeSesion, leerCookie, NOMBRE_COOKIE } from './cookies.js';

describe('leerCookie', () => {
  it('encuentra la cookie entre varias y la decodifica', () => {
    const cabecera = `otra=1; ${NOMBRE_COOKIE}=abc%2Bdef; ultima=3`;

    expect(leerCookie(cabecera, NOMBRE_COOKIE)).toBe('abc+def');
  });

  it('devuelve undefined si no está, si la cabecera falta o el valor está roto', () => {
    expect(leerCookie(undefined, NOMBRE_COOKIE)).toBeUndefined();
    expect(leerCookie('otra=1', NOMBRE_COOKIE)).toBeUndefined();
    expect(leerCookie(`${NOMBRE_COOKIE}=%E0%A4%A`, NOMBRE_COOKIE)).toBeUndefined();
    expect(leerCookie(`x${NOMBRE_COOKIE}=1`, NOMBRE_COOKIE)).toBeUndefined();
  });
});

describe('cookies de sesión', () => {
  it('la de sesión es HttpOnly, SameSite=Lax y dura 30 días; Secure solo con HTTPS', () => {
    const http = cookieDeSesion('tok', false);
    const https = cookieDeSesion('tok', true);

    expect(http).toContain(`${NOMBRE_COOKIE}=tok`);
    expect(http).toContain('HttpOnly');
    expect(http).toContain('SameSite=Lax');
    expect(http).toContain('Path=/');
    expect(http).toContain(`Max-Age=${30 * 24 * 60 * 60}`);
    expect(http).not.toContain('Secure');
    expect(https).toContain('Secure');
  });

  it('la de cierre vacía la cookie y la hace caducar ya', () => {
    const cierre = cookieDeCierre(false);

    expect(cierre).toContain(`${NOMBRE_COOKIE}=;`);
    expect(cierre).toContain('Max-Age=0');
    expect(cierre).toContain('HttpOnly');
  });
});
