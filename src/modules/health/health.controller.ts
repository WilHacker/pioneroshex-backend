import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

interface EstadoSalud {
  estado: 'ok';
  baseDatos: 'ok';
}

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async comprobar(): Promise<EstadoSalud> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { estado: 'ok', baseDatos: 'ok' };
    } catch (error: unknown) {
      const mensaje = error instanceof Error ? error.message || error.name : String(error);
      this.logger.error(
        `La base de datos no responde: ${mensaje}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException({ estado: 'error', baseDatos: 'caida' });
    }
  }
}
