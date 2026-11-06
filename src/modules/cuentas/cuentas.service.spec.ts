import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RepositorioCuentasMemoria } from '../../infra/cuentas/repositorio-cuentas.memoria.js';
import { hashCodigo, hashToken } from './codigos.js';
import {
  CuentasService,
  DURACION_SESION_MS,
  INTENTOS_MAX,
  VENTANA_BLOQUEO_MS,
} from './cuentas.service.js';

const DIA_MS = 24 * 60 * 60 * 1000;
const CLAVE = 'una clave larga';

function crear(codigoRegistro?: string) {
  let ahora = 1_000_000;
  const repo = new RepositorioCuentasMemoria();
  const servicio = new CuentasService(repo, { ahora: () => ahora, codigoRegistro });
  return {
    repo,
    servicio,
    avanzar: (ms: number) => {
      ahora += ms;
    },
  };
}

/** Repite una acción una tras otra: los fallos tienen que ir en serie para que cuenten. */
const repetir = (veces: number, accion: () => Promise<unknown>): Promise<void> =>
  Array.from({ length: veces }).reduce<Promise<void>>(
    (previa) => previa.then(accion).then(() => undefined),
    Promise.resolve(),
  );

const estado = async (promesa: Promise<unknown>): Promise<number> => {
  try {
    await promesa;
  } catch (e) {
    return (e as HttpException).getStatus();
  }
  throw new Error('no falló');
};

describe('CuentasService: registrar', () => {
  it('crea la cuenta, abre sesión y entrega 8 códigos que se guardan solo con hash', async () => {
    const { repo, servicio } = crear();

    const r = await servicio.registrar('  Ana  ', CLAVE);

    expect(r.usuario.nombre).toBe('Ana');
    expect(r.codigos).toHaveLength(8);
    expect(await servicio.usuarioDeSesion(r.token)).toEqual(r.usuario);
    expect(repo.codigosDe(r.usuario.id)).toEqual(r.codigos.map((c) => hashCodigo(c)));
    const guardado = await repo.usuarioPorNombre('ana');
    expect(guardado?.hashContrasena).toMatch(/^scrypt\$/);
    expect(JSON.stringify(guardado)).not.toContain(CLAVE);
    expect(await repo.sesionPorHash(hashToken(r.token))).not.toBeNull();
    expect(await repo.sesionPorHash(r.token)).toBeNull();
  });

  it('un nombre repetido, aunque cambien las mayúsculas, da 409', async () => {
    const { servicio } = crear();
    await servicio.registrar('Ana', CLAVE);

    expect(await estado(servicio.registrar('ANA', CLAVE))).toBe(409);
    expect(await estado(servicio.registrar(' ana ', CLAVE))).toBe(409);
  });

  it('con registro cerrado hace falta el código (403) y con el código correcto funciona', async () => {
    const { servicio } = crear('familia-2026');

    expect(await estado(servicio.registrar('Ana', CLAVE))).toBe(403);
    expect(await estado(servicio.registrar('Ana', CLAVE, 'otro'))).toBe(403);
    await expect(servicio.registrar('Ana', CLAVE, 'familia-2026')).resolves.toMatchObject({
      usuario: { nombre: 'Ana' },
    });
  });
});

describe('CuentasService: entrar y salir', () => {
  it('entra con la contraseña correcta, sin distinguir mayúsculas en el nombre', async () => {
    const { servicio } = crear();
    const registro = await servicio.registrar('Ana', CLAVE);

    const r = await servicio.entrar('ANA', CLAVE);

    expect(r.usuario).toEqual(registro.usuario);
    expect(r.token).not.toBe(registro.token);
    expect(await servicio.usuarioDeSesion(r.token)).toEqual(registro.usuario);
  });

  it('contraseña mala y usuario inexistente dan el mismo 401 con el mismo mensaje', async () => {
    const { servicio } = crear();
    await servicio.registrar('Ana', CLAVE);
    const intentos = [
      ['Ana', 'mala clave 123'],
      ['Nadie', CLAVE],
    ] as const;
    const mensajes = await Promise.all(
      intentos.map(async ([nombre, clave]) => {
        try {
          await servicio.entrar(nombre, clave);
          return null;
        } catch (e) {
          expect((e as HttpException).getStatus()).toBe(401);
          return (e as HttpException).message;
        }
      }),
    );

    expect(mensajes.every((m) => m !== null)).toBe(true);
    expect(mensajes[0]).toBe(mensajes[1]);
  });

  it('tras demasiados fallos bloquea la cuenta (429) aunque llegue la contraseña buena', async () => {
    const { servicio } = crear();
    await servicio.registrar('Ana', CLAVE);
    await repetir(INTENTOS_MAX, async () => {
      expect(await estado(servicio.entrar('Ana', 'mala clave 123'))).toBe(401);
    });

    expect(await estado(servicio.entrar('Ana', CLAVE))).toBe(429);
  });

  it('el bloqueo también protege nombres que no existen y se levanta con el tiempo', async () => {
    const { servicio, avanzar } = crear();
    await repetir(INTENTOS_MAX, () => estado(servicio.entrar('Fantasma', CLAVE)));
    expect(await estado(servicio.entrar('Fantasma', CLAVE))).toBe(429);

    avanzar(VENTANA_BLOQUEO_MS + 1);

    expect(await estado(servicio.entrar('Fantasma', CLAVE))).toBe(401);
  });

  it('un acierto borra los fallos anteriores', async () => {
    const { servicio } = crear();
    await servicio.registrar('Ana', CLAVE);
    await repetir(INTENTOS_MAX - 1, () => estado(servicio.entrar('Ana', 'mala 12345')));
    await servicio.entrar('Ana', CLAVE);

    expect(await estado(servicio.entrar('Ana', 'mala 12345'))).toBe(401);
    await expect(servicio.entrar('Ana', CLAVE)).resolves.toBeDefined();
  });

  it('salir invalida el token', async () => {
    const { servicio } = crear();
    const { token } = await servicio.registrar('Ana', CLAVE);

    await servicio.salir(token);

    expect(await servicio.usuarioDeSesion(token)).toBeUndefined();
    await expect(servicio.salir(undefined)).resolves.toBeUndefined();
  });
});

describe('CuentasService: sesiones', () => {
  it('sin token o con un token desconocido no hay usuario', async () => {
    const { servicio } = crear();

    expect(await servicio.usuarioDeSesion(undefined)).toBeUndefined();
    expect(await servicio.usuarioDeSesion('')).toBeUndefined();
    expect(await servicio.usuarioDeSesion('inventado')).toBeUndefined();
  });

  it('caduca a los 30 días y se borra al descubrirlo', async () => {
    const { servicio, repo, avanzar } = crear();
    const { token } = await servicio.registrar('Ana', CLAVE);

    avanzar(DURACION_SESION_MS + 1);

    expect(await servicio.usuarioDeSesion(token)).toBeUndefined();
    expect(await repo.sesionPorHash(hashToken(token))).toBeNull();
  });

  it('usarla la renueva: cuenta 30 días desde el último uso', async () => {
    const { servicio, avanzar } = crear();
    const { token } = await servicio.registrar('Ana', CLAVE);

    avanzar(20 * DIA_MS);
    expect(await servicio.usuarioDeSesion(token)).toBeDefined();
    avanzar(20 * DIA_MS);

    expect(await servicio.usuarioDeSesion(token)).toBeDefined();
  });

  it('barrer elimina las sesiones vencidas', async () => {
    const { servicio, repo, avanzar } = crear();
    const { token } = await servicio.registrar('Ana', CLAVE);
    avanzar(DURACION_SESION_MS + 1);

    await servicio.barrer();

    expect(await repo.sesionPorHash(hashToken(token))).toBeNull();
  });

  it('si la cuenta se borró, su sesión ya no sirve', async () => {
    const { servicio, repo } = crear();
    const { token, usuario } = await servicio.registrar('Ana', CLAVE);
    await repo.borrarUsuario(usuario.id);

    expect(await servicio.usuarioDeSesion(token)).toBeUndefined();
  });
});

describe('CuentasService: recuperar con un código', () => {
  it('con un código válido cambia la contraseña, cierra las demás sesiones y abre una nueva', async () => {
    const { servicio } = crear();
    const registro = await servicio.registrar('Ana', CLAVE);
    const otra = await servicio.entrar('Ana', CLAVE);

    const r = await servicio.recuperar('ana', registro.codigos[0] ?? '', 'una clave nueva');

    expect(r.usuario).toEqual(registro.usuario);
    expect(r.codigosRestantes).toBe(7);
    expect(await servicio.usuarioDeSesion(registro.token)).toBeUndefined();
    expect(await servicio.usuarioDeSesion(otra.token)).toBeUndefined();
    expect(await servicio.usuarioDeSesion(r.token)).toEqual(registro.usuario);
    expect(await estado(servicio.entrar('Ana', CLAVE))).toBe(401);
    await expect(servicio.entrar('Ana', 'una clave nueva')).resolves.toBeDefined();
  });

  it('cada código sirve una sola vez; se acepta en minúsculas y sin guion', async () => {
    const { servicio } = crear();
    const { codigos } = await servicio.registrar('Ana', CLAVE);
    const primero = codigos[0] ?? '';

    await servicio.recuperar('Ana', primero.toLowerCase().replace('-', ' '), 'una clave nueva');

    expect(await estado(servicio.recuperar('Ana', primero, 'otra clave nueva'))).toBe(401);
  });

  it('un código falso, uno de otra cuenta o un usuario inexistente dan el mismo 401', async () => {
    const { servicio } = crear();
    const ana = await servicio.registrar('Ana', CLAVE);
    const beto = await servicio.registrar('Beto', CLAVE);
    const intentos = [
      ['Ana', 'AAAA-BBBB-CCCC-DDDD'],
      ['Ana', beto.codigos[0] ?? ''],
      ['Nadie', ana.codigos[0] ?? ''],
      ['Ana', 'basura'],
    ] as const;
    const mensajes = await Promise.all(
      intentos.map(async ([nombre, codigo]) => {
        try {
          await servicio.recuperar(nombre, codigo, 'una clave nueva');
          return null;
        } catch (e) {
          expect((e as HttpException).getStatus()).toBe(401);
          return (e as HttpException).message;
        }
      }),
    );

    expect(mensajes.every((m) => m !== null)).toBe(true);
    expect(new Set(mensajes).size).toBe(1);
  });

  it('adivinar códigos se bloquea igual que adivinar contraseñas', async () => {
    const { servicio } = crear();
    const { codigos } = await servicio.registrar('Ana', CLAVE);
    await repetir(INTENTOS_MAX, () =>
      estado(servicio.recuperar('Ana', 'AAAAA-BBBBB', 'una clave nueva')),
    );

    expect(await estado(servicio.recuperar('Ana', codigos[0] ?? '', 'una clave nueva'))).toBe(429);
  });
});

describe('CuentasService: mantener la cuenta', () => {
  it('cambiar la contraseña pide la actual, cierra las otras sesiones y abre una nueva', async () => {
    const { servicio } = crear();
    const { usuario, token } = await servicio.registrar('Ana', CLAVE);

    expect(
      await estado(servicio.cambiarContrasena(usuario.id, 'mala clave 123', 'nueva clave 123')),
    ).toBe(401);
    const nuevo = await servicio.cambiarContrasena(usuario.id, CLAVE, 'nueva clave 123');

    expect(await servicio.usuarioDeSesion(token)).toBeUndefined();
    expect(await servicio.usuarioDeSesion(nuevo)).toEqual(usuario);
    await expect(servicio.entrar('Ana', 'nueva clave 123')).resolves.toBeDefined();
  });

  it('regenerar los códigos pide la contraseña e invalida los anteriores', async () => {
    const { servicio } = crear();
    const { usuario, codigos } = await servicio.registrar('Ana', CLAVE);

    expect(await estado(servicio.regenerarCodigos(usuario.id, 'mala clave 123'))).toBe(401);
    const nuevos = await servicio.regenerarCodigos(usuario.id, CLAVE);

    expect(nuevos).toHaveLength(8);
    expect(nuevos.some((c) => codigos.includes(c))).toBe(false);
    expect(await servicio.codigosRestantes(usuario.id)).toBe(8);
    expect(await estado(servicio.recuperar('Ana', codigos[0] ?? '', 'una clave nueva'))).toBe(401);
    await expect(
      servicio.recuperar('Ana', nuevos[0] ?? '', 'una clave nueva'),
    ).resolves.toBeDefined();
  });

  it('cuenta los códigos que quedan', async () => {
    const { servicio } = crear();
    const { usuario, codigos } = await servicio.registrar('Ana', CLAVE);

    expect(await servicio.codigosRestantes(usuario.id)).toBe(8);
    await servicio.recuperar('Ana', codigos[0] ?? '', 'una clave nueva');

    expect(await servicio.codigosRestantes(usuario.id)).toBe(7);
  });

  it('borrar la cuenta pide la contraseña y deja el nombre libre', async () => {
    const { servicio } = crear();
    const { usuario, token } = await servicio.registrar('Ana', CLAVE);

    expect(await estado(servicio.borrarCuenta(usuario.id, 'mala clave 123'))).toBe(401);
    await servicio.borrarCuenta(usuario.id, CLAVE);

    expect(await servicio.usuarioDeSesion(token)).toBeUndefined();
    expect(await estado(servicio.entrar('Ana', CLAVE))).toBe(401);
    await expect(servicio.registrar('Ana', 'otra clave larga')).resolves.toBeDefined();
  });

  it('los intentos de contraseña desde dentro también se bloquean', async () => {
    const { servicio } = crear();
    const { usuario } = await servicio.registrar('Ana', CLAVE);
    await repetir(INTENTOS_MAX, () => estado(servicio.borrarCuenta(usuario.id, 'mala clave 123')));

    expect(await estado(servicio.borrarCuenta(usuario.id, CLAVE))).toBe(429);
  });
});

describe('CuentasService: bloqueos sin carreras ni daño a terceros', () => {
  it('quien adivina contraseñas desde su red no puede dejar fuera a la dueña de la cuenta', async () => {
    const { servicio } = crear();
    await servicio.registrar('Ana', CLAVE);
    await repetir(INTENTOS_MAX, () => estado(servicio.entrar('Ana', 'mala clave 123', 'atacante')));

    expect(await estado(servicio.entrar('Ana', 'mala clave 123', 'atacante'))).toBe(429);
    await expect(servicio.entrar('Ana', CLAVE, 'casa-de-ana')).resolves.toBeDefined();
  });

  it('diez intentos simultáneos no se cuelan todos: solo caben INTENTOS_MAX', async () => {
    const { servicio } = crear();
    await servicio.registrar('Ana', CLAVE);

    const resultados = await Promise.all(
      Array.from({ length: 10 }, () => estado(servicio.entrar('Ana', 'mala clave 123', 'ip'))),
    );

    expect(resultados.filter((r) => r === 401)).toHaveLength(INTENTOS_MAX);
    expect(resultados.filter((r) => r === 429)).toHaveLength(10 - INTENTOS_MAX);
  });

  it('adivinar un código de recuperación y adivinar una contraseña comparten el mismo contador', async () => {
    const { servicio } = crear();
    await servicio.registrar('Ana', CLAVE);
    await repetir(INTENTOS_MAX - 1, () => estado(servicio.entrar('Ana', 'mala clave 123', 'ip')));
    await estado(servicio.recuperar('Ana', 'AAAA-BBBB-CCCC-DDDD', 'una clave nueva', 'ip'));

    expect(await estado(servicio.entrar('Ana', CLAVE, 'ip'))).toBe(429);
  });
});

describe('CuentasService: nombres y sesiones', () => {
  it('las letras de ancho completo y los espacios de más no crean un nombre «distinto»', async () => {
    const { servicio } = crear();
    await servicio.registrar('Ana López', CLAVE);

    expect(await estado(servicio.registrar('Ａｎａ  López', CLAVE))).toBe(409);
    expect(await estado(servicio.registrar('ana   lópez ', CLAVE))).toBe(409);
  });

  it('el nombre guardado lleva los espacios juntos', async () => {
    const { servicio } = crear();

    const { usuario } = await servicio.registrar('Ana    López', CLAVE);

    expect(usuario.nombre).toBe('Ana López');
  });

  it('cambiar a la misma contraseña se rechaza (400)', async () => {
    const { servicio } = crear();
    const { usuario } = await servicio.registrar('Ana', CLAVE);

    expect(await estado(servicio.cambiarContrasena(usuario.id, CLAVE, CLAVE))).toBe(400);
  });

  it('renovar una sesión que se cerró mientras tanto no la resucita', async () => {
    const { servicio, repo, avanzar } = crear();
    const { token } = await servicio.registrar('Ana', CLAVE);
    avanzar(20 * DIA_MS);

    await repo.renovarSesion(hashToken(token), 123_456);
    await servicio.salir(token);
    await repo.renovarSesion(hashToken(token), 999_999);

    expect(await repo.sesionPorHash(hashToken(token))).toBeNull();
  });

  it('un temporizador barre solo las sesiones vencidas', async () => {
    vi.useFakeTimers();
    try {
      let ahora = 1_000_000;
      const repo = new RepositorioCuentasMemoria();
      const servicio = new CuentasService(repo, { ahora: () => ahora });
      const { token } = await servicio.registrar('Ana', CLAVE);
      servicio.onModuleInit();
      ahora += DURACION_SESION_MS + 1;

      await vi.advanceTimersByTimeAsync(60 * 60 * 1000 + 1);
      servicio.onModuleDestroy();

      expect(await repo.sesionPorHash(hashToken(token))).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
