import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

function crearControlador(consulta: () => Promise<unknown>): HealthController {
  const prisma = { $queryRaw: consulta } as unknown as PrismaService;
  return new HealthController(prisma);
}

describe('HealthController', () => {
  it('informa ok cuando la base de datos responde', async () => {
    const controlador = crearControlador(() => Promise.resolve([{ '?column?': 1 }]));

    await expect(controlador.comprobar()).resolves.toEqual({ estado: 'ok', baseDatos: 'ok' });
  });

  it('responde 503 cuando la base de datos falla', async () => {
    const controlador = crearControlador(() => Promise.reject(new Error('conexión rechazada')));

    await expect(controlador.comprobar()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
