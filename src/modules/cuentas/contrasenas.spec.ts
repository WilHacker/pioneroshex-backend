import { describe, expect, it } from 'vitest';
import { hashContrasena, verificarContrasena } from './contrasenas.js';

describe('contraseñas con scrypt', () => {
  it('el hash lleva sus parámetros y nunca contiene la contraseña', async () => {
    const hash = await hashContrasena('una clave larga');

    expect(hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[\w-]+\$[\w-]+$/);
    expect(hash).not.toContain('una clave larga');
  });

  it('verifica la contraseña correcta y rechaza la incorrecta', async () => {
    const hash = await hashContrasena('una clave larga');

    expect(await verificarContrasena('una clave larga', hash)).toBe(true);
    expect(await verificarContrasena('otra clave larga', hash)).toBe(false);
    expect(await verificarContrasena('', hash)).toBe(false);
  });

  it('la misma contraseña da hashes distintos (sal aleatoria)', async () => {
    const [a, b] = await Promise.all([
      hashContrasena('igual igual'),
      hashContrasena('igual igual'),
    ]);

    expect(a).not.toBe(b);
  });

  it('un hash guardado con formato raro o corrupto no verifica y no lanza', async () => {
    const malos = ['', 'texto', 'scrypt$1$2', 'bcrypt$1$2$3$4$5', 'scrypt$x$8$1$aa$bb'];
    const resultados = await Promise.all(
      malos.map((malo) => verificarContrasena('lo que sea', malo)),
    );

    expect(resultados).toEqual(malos.map(() => false));
  });

  it('rechaza parámetros de coste absurdos en un hash manipulado (no agota la memoria)', async () => {
    const manipulado = `scrypt$${2 ** 30}$8$1$c2Fs$aGFzaA`;

    expect(await verificarContrasena('x', manipulado)).toBe(false);
  });
});

describe('tope de concurrencia de scrypt', () => {
  it('con una avalancha, los que no caben en la cola reciben 503 y el resto termina bien', async () => {
    const resultados = await Promise.allSettled(
      Array.from({ length: 120 }, () => hashContrasena('una clave larga')),
    );

    const rechazados = resultados.filter((r) => r.status === 'rejected');
    const hechos = resultados.filter((r) => r.status === 'fulfilled');
    expect(rechazados.length).toBeGreaterThan(0);
    expect(hechos.length).toBeGreaterThan(0);
    for (const r of rechazados) {
      expect((r.reason as { getStatus?: () => number }).getStatus?.()).toBe(503);
    }
    // Pasada la avalancha, el cupo se liberó y todo vuelve a funcionar.
    expect(await verificarContrasena('x', await hashContrasena('x'))).toBe(true);
  }, 60_000);
});
