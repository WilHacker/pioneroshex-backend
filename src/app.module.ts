import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validarEnv } from './config/env.schema.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { CuentasModule } from './modules/cuentas/cuentas.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { JuegoModule } from './modules/juego/juego.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validarEnv }),
    PrismaModule,
    HealthModule,
    CuentasModule,
    JuegoModule,
  ],
})
export class AppModule {}
