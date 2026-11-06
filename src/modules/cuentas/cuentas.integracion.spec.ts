import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPCIONES_LIMITE_HTTP } from '../../infra/http/limite-http.guard.js';
import { moduloDePrueba, ORIGEN_DE_PRUEBA } from '../pruebas-nest.js';
import { CuentasModule } from './cuentas.module.js';

const ORIGEN = ORIGEN_DE_PRUEBA;
const CLAVE = 'una clave larga';

async function crearApp(
  entorno: Record<string, unknown> = {},
  limite: number = 1000,
): Promise<INestApplication> {
  // ConfigModule copia lo validado a `process.env`: se restaura para que una prueba no contagie a otra.
  const entornoAntes = { ...process.env };
  const modulo = await moduloDePrueba([CuentasModule], entorno)
    .overrideProvider(OPCIONES_LIMITE_HTTP)
    .useValue({ maximo: limite })
    .compile();
  const app = modulo.createNestApplication();
  await app.init();
  process.env = entornoAntes;
  return app;
}

/** `pioneros_sesion=...` listo para mandar de vuelta, sacado de la cabecera `Set-Cookie`. */
const cookieDe = (respuesta: request.Response): string =>
  (respuesta.headers['set-cookie'] as unknown as string[] | undefined)?.[0]?.split(';')[0] ?? '';

let app: INestApplication;

beforeAll(async () => {
  app = await crearApp();
});
afterAll(() => app.close());

describe('API de cuentas', () => {
  it('registro: crea la cuenta, pone la cookie de sesión y entrega 8 códigos una sola vez', async () => {
    const r = await request(app.getHttpServer())
      .post('/cuentas/registro')
      .set('Origin', ORIGEN)
      .send({ nombre: 'Ana', contrasena: CLAVE })
      .expect(201);

    const cabecera = (r.headers['set-cookie'] as unknown as string[])[0] ?? '';
    expect(cabecera).toContain('pioneros_sesion=');
    expect(cabecera).toContain('HttpOnly');
    expect(cabecera).toContain('SameSite=Lax');
    expect(r.body).toMatchObject({ usuario: { nombre: 'Ana' } });
    expect((r.body as { codigos: string[] }).codigos).toHaveLength(8);
    expect(JSON.stringify(r.body)).not.toContain(CLAVE);
    expect(JSON.stringify(r.body)).not.toMatch(/hash/i);
  });

  it('con la cookie, /yo dice quién eres; sin ella, 401', async () => {
    const registro = await request(app.getHttpServer())
      .post('/cuentas/registro')
      .send({ nombre: 'Beto', contrasena: CLAVE });
    const cookie = cookieDe(registro);

    const yo = await request(app.getHttpServer())
      .get('/cuentas/yo')
      .set('Cookie', cookie)
      .expect(200);
    expect(yo.body).toMatchObject({ nombre: 'Beto' });
    await request(app.getHttpServer()).get('/cuentas/yo').expect(401);
    await request(app.getHttpServer())
      .get('/cuentas/yo')
      .set('Cookie', 'pioneros_sesion=falso')
      .expect(401);
  });

  it('lo que depende de la sesión no se guarda en cachés compartidas', async () => {
    const registro = await request(app.getHttpServer())
      .post('/cuentas/registro')
      .send({ nombre: 'Nico', contrasena: CLAVE })
      .expect(201);
    const cookie = cookieDe(registro);

    expect(registro.headers['cache-control']).toBe('no-store');
    const yo = await request(app.getHttpServer()).get('/cuentas/yo').set('Cookie', cookie);
    expect(yo.headers['cache-control']).toBe('no-store');
    const codigos = await request(app.getHttpServer())
      .get('/cuentas/codigos')
      .set('Cookie', cookie);
    expect(codigos.headers['cache-control']).toBe('no-store');
  });

  it('un POST que el navegador marca como de otro sitio se rechaza aunque lleve el origen bueno', async () => {
    await request(app.getHttpServer())
      .post('/cuentas/registro')
      .set('Origin', ORIGEN)
      .set('Sec-Fetch-Site', 'cross-site')
      .send({ nombre: 'Olga', contrasena: CLAVE })
      .expect(403);
  });

  it('entrar: bien (200 y cookie) o mal (401), sin distinguir nombre ni contraseña', async () => {
    await request(app.getHttpServer())
      .post('/cuentas/registro')
      .send({ nombre: 'Cleo', contrasena: CLAVE });

    const bien = await request(app.getHttpServer())
      .post('/cuentas/entrar')
      .send({ nombre: 'cleo', contrasena: CLAVE })
      .expect(200);
    expect(cookieDe(bien)).toContain('pioneros_sesion=');
    const malaClave = await request(app.getHttpServer())
      .post('/cuentas/entrar')
      .send({ nombre: 'Cleo', contrasena: 'mala clave 123' })
      .expect(401);
    const malNombre = await request(app.getHttpServer())
      .post('/cuentas/entrar')
      .send({ nombre: 'Nadie', contrasena: CLAVE })
      .expect(401);
    expect(malaClave.body).toEqual(malNombre.body);
  });

  it('salir cierra la sesión y borra la cookie', async () => {
    const registro = await request(app.getHttpServer())
      .post('/cuentas/registro')
      .send({ nombre: 'Dani', contrasena: CLAVE });
    const cookie = cookieDe(registro);

    const salida = await request(app.getHttpServer())
      .post('/cuentas/salir')
      .set('Cookie', cookie)
      .expect(204);

    expect((salida.headers['set-cookie'] as unknown as string[])[0]).toContain('Max-Age=0');
    await request(app.getHttpServer()).get('/cuentas/yo').set('Cookie', cookie).expect(401);
  });

  it('un nombre repetido da 409 y datos mal formados dan 400', async () => {
    await request(app.getHttpServer())
      .post('/cuentas/registro')
      .send({ nombre: 'Eva', contrasena: CLAVE });

    await request(app.getHttpServer())
      .post('/cuentas/registro')
      .send({ nombre: 'EVA', contrasena: CLAVE })
      .expect(409);
    await request(app.getHttpServer())
      .post('/cuentas/registro')
      .send({ nombre: 'ab', contrasena: CLAVE })
      .expect(400);
    await request(app.getHttpServer())
      .post('/cuentas/registro')
      .send({ nombre: 'Fran', contrasena: 'corta' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/cuentas/registro')
      .send({ nombre: 'Fran', contrasena: 'x'.repeat(129) })
      .expect(400);
    await request(app.getHttpServer())
      .post('/cuentas/registro')
      .send({ nombre: 'Fran', contrasena: CLAVE, admin: true })
      .expect(400);
    await request(app.getHttpServer())
      .post('/cuentas/registro')
      .send({ nombre: 'Fra<n>', contrasena: CLAVE })
      .expect(400);
  });

  it('rechaza el registro y la entrada que vienen de otra página (CSRF)', async () => {
    await request(app.getHttpServer())
      .post('/cuentas/registro')
      .set('Origin', 'http://malo.example')
      .send({ nombre: 'Gabi', contrasena: CLAVE })
      .expect(403);
    await request(app.getHttpServer())
      .post('/cuentas/entrar')
      .set('Origin', 'http://malo.example')
      .send({ nombre: 'Gabi', contrasena: CLAVE })
      .expect(403);
    await request(app.getHttpServer())
      .post('/cuentas/salir')
      .set('Origin', 'http://malo.example')
      .expect(403);
  });

  it('una contraseña con tildes y espacios sirve igual (no se recorta ni se normaliza)', async () => {
    const clave = '  Contraseña con ñ y espacios  ';
    await request(app.getHttpServer())
      .post('/cuentas/registro')
      .send({ nombre: 'Hugo', contrasena: clave });

    await request(app.getHttpServer())
      .post('/cuentas/entrar')
      .send({ nombre: 'Hugo', contrasena: clave })
      .expect(200);
    await request(app.getHttpServer())
      .post('/cuentas/entrar')
      .send({ nombre: 'Hugo', contrasena: clave.trim() })
      .expect(401);
  });
});

const servidor = () => app.getHttpServer();

const registrar = async (nombre: string) => {
  const r = await request(servidor()).post('/cuentas/registro').send({ nombre, contrasena: CLAVE });
  return { cookie: cookieDe(r), codigos: (r.body as { codigos: string[] }).codigos };
};

describe('API de cuentas: recuperar y mantener la cuenta', () => {
  it('recuperar con un código cambia la contraseña, abre sesión nueva y gasta el código', async () => {
    const { cookie, codigos } = await registrar('Rita');

    const r = await request(servidor())
      .post('/cuentas/recuperar')
      .send({ nombre: 'rita', codigo: codigos[0], nuevaContrasena: 'una clave nueva' })
      .expect(200);

    expect(r.body).toMatchObject({ usuario: { nombre: 'Rita' }, codigosRestantes: 7 });
    await request(servidor()).get('/cuentas/yo').set('Cookie', cookie).expect(401);
    await request(servidor()).get('/cuentas/yo').set('Cookie', cookieDe(r)).expect(200);
    await request(servidor())
      .post('/cuentas/entrar')
      .send({ nombre: 'Rita', contrasena: CLAVE })
      .expect(401);
    await request(servidor())
      .post('/cuentas/recuperar')
      .send({ nombre: 'Rita', codigo: codigos[0], nuevaContrasena: 'otra clave nueva' })
      .expect(401);
  });

  it('cambiar la contraseña pide estar dentro y la actual', async () => {
    const { cookie } = await registrar('Saul');

    await request(servidor())
      .post('/cuentas/contrasena')
      .send({ actual: CLAVE, nueva: 'una clave nueva' })
      .expect(401);
    await request(servidor())
      .post('/cuentas/contrasena')
      .set('Cookie', cookie)
      .send({ actual: 'mala clave 123', nueva: 'una clave nueva' })
      .expect(401);
    const ok = await request(servidor())
      .post('/cuentas/contrasena')
      .set('Cookie', cookie)
      .send({ actual: CLAVE, nueva: 'una clave nueva' })
      .expect(204);

    await request(servidor()).get('/cuentas/yo').set('Cookie', cookie).expect(401);
    await request(servidor()).get('/cuentas/yo').set('Cookie', cookieDe(ok)).expect(200);
  });

  it('los códigos: se cuentan, se regeneran con la contraseña y los viejos mueren', async () => {
    const { cookie, codigos } = await registrar('Tina');

    const antes = await request(servidor())
      .get('/cuentas/codigos')
      .set('Cookie', cookie)
      .expect(200);
    expect(antes.body).toEqual({ restantes: 8 });
    await request(servidor())
      .post('/cuentas/codigos')
      .set('Cookie', cookie)
      .send({ contrasena: 'mala clave 123' })
      .expect(401);
    const nuevos = await request(servidor())
      .post('/cuentas/codigos')
      .set('Cookie', cookie)
      .send({ contrasena: CLAVE })
      .expect(200);

    expect((nuevos.body as { codigos: string[] }).codigos).toHaveLength(8);
    await request(servidor())
      .post('/cuentas/recuperar')
      .send({ nombre: 'Tina', codigo: codigos[0], nuevaContrasena: 'una clave nueva' })
      .expect(401);
    await request(servidor()).get('/cuentas/codigos').expect(401);
  });

  it('borrar la cuenta pide la contraseña, cierra la sesión y libera el nombre', async () => {
    const { cookie } = await registrar('Uma');

    await request(servidor())
      .delete('/cuentas/yo')
      .set('Cookie', cookie)
      .send({ contrasena: 'mala clave 123' })
      .expect(401);
    const r = await request(servidor())
      .delete('/cuentas/yo')
      .set('Cookie', cookie)
      .send({ contrasena: CLAVE })
      .expect(204);

    expect((r.headers['set-cookie'] as unknown as string[])[0]).toContain('Max-Age=0');
    await request(servidor()).get('/cuentas/yo').set('Cookie', cookie).expect(401);
    await request(servidor())
      .post('/cuentas/registro')
      .send({ nombre: 'Uma', contrasena: CLAVE })
      .expect(201);
  });

  it('las rutas que cambian algo rechazan otro origen (CSRF)', async () => {
    const { cookie } = await registrar('Vera');
    const malo = 'http://malo.example';

    await request(servidor())
      .post('/cuentas/contrasena')
      .set('Cookie', cookie)
      .set('Origin', malo)
      .send({ actual: CLAVE, nueva: 'una clave nueva' })
      .expect(403);
    await request(servidor())
      .post('/cuentas/codigos')
      .set('Cookie', cookie)
      .set('Origin', malo)
      .send({ contrasena: CLAVE })
      .expect(403);
    await request(servidor())
      .delete('/cuentas/yo')
      .set('Cookie', cookie)
      .set('Origin', malo)
      .send({ contrasena: CLAVE })
      .expect(403);
    await request(servidor())
      .post('/cuentas/recuperar')
      .set('Origin', malo)
      .send({ nombre: 'Vera', codigo: 'AAAAA-BBBBB', nuevaContrasena: 'una clave nueva' })
      .expect(403);
    await request(servidor()).get('/cuentas/yo').set('Cookie', cookie).expect(200);
  });
});

describe('API de cuentas: límites y registro cerrado', () => {
  it('responde 429 cuando una IP pasa del límite de intentos', async () => {
    const limitada = await crearApp({}, 2);
    try {
      // Dos intentos a la vez caben en el límite; el tercero, ya no.
      await Promise.all(
        [1, 2].map(() =>
          request(limitada.getHttpServer())
            .post('/cuentas/entrar')
            .send({ nombre: 'Ivan', contrasena: CLAVE })
            .expect(401),
        ),
      );
      await request(limitada.getHttpServer())
        .post('/cuentas/entrar')
        .send({ nombre: 'Ivan', contrasena: CLAVE })
        .expect(429);
    } finally {
      await limitada.close();
    }
  });

  it('con CODIGO_REGISTRO, sin el código no se puede crear una cuenta', async () => {
    const cerrada = await crearApp({ CODIGO_REGISTRO: 'familia-2026' });
    try {
      await request(cerrada.getHttpServer())
        .post('/cuentas/registro')
        .send({ nombre: 'Juan', contrasena: CLAVE })
        .expect(403);
      await request(cerrada.getHttpServer())
        .post('/cuentas/registro')
        .send({ nombre: 'Juan', contrasena: CLAVE, codigoRegistro: 'familia-2026' })
        .expect(201);
    } finally {
      await cerrada.close();
    }
  });

  it('con el frontend en HTTPS la cookie lleva Secure', async () => {
    const segura = await crearApp({ FRONTEND_URL: 'https://juego.example' });
    try {
      const r = await request(segura.getHttpServer())
        .post('/cuentas/registro')
        .send({ nombre: 'Kira', contrasena: CLAVE })
        .expect(201);

      expect((r.headers['set-cookie'] as unknown as string[])[0]).toContain('Secure');
    } finally {
      await segura.close();
    }
  });
});
