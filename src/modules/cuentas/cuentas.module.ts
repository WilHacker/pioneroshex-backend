import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RepositorioCuentas } from '../../infra/cuentas/repositorio-cuentas.js';
import { RepositorioHistorial } from '../../infra/historial/repositorio-historial.js';
import { HistorialModule } from '../../infra/prisma/historial.module.js';
import { OPCIONES_LIMITE_HTTP } from '../../infra/http/limite-http.guard.js';
import { RepositorioCuentasPrisma } from '../../infra/prisma/repositorio-cuentas.prisma.js';
import type { Env } from '../../config/env.schema.js';
import { COOKIE_SEGURA, CuentasController } from './cuentas.controller.js';
import { CuentasService } from './cuentas.service.js';
import { ORIGENES_PERMITIDOS, OrigenGuard } from './origen.guard.js';

/** Registrarse y entrar son lo que más intentan abusar: 10 por minuto por IP, no los 20 de salas. */
const PETICIONES_POR_MINUTO = 10;

@Module({
  imports: [HistorialModule],
  controllers: [CuentasController],
  providers: [
    { provide: RepositorioCuentas, useClass: RepositorioCuentasPrisma },
    {
      provide: CuentasService,
      useFactory: (
        repositorio: RepositorioCuentas,
        historial: RepositorioHistorial,
        config: ConfigService<Env, true>,
      ) =>
        new CuentasService(repositorio, {
          codigoRegistro: config.get('CODIGO_REGISTRO', { infer: true }),
          historial,
        }),
      inject: [RepositorioCuentas, RepositorioHistorial, ConfigService],
    },
    {
      provide: ORIGENES_PERMITIDOS,
      useFactory: (config: ConfigService<Env, true>) => config.get('FRONTEND_URL', { infer: true }),
      inject: [ConfigService],
    },
    {
      provide: COOKIE_SEGURA,
      useFactory: (config: ConfigService<Env, true>) =>
        config
          .get('FRONTEND_URL', { infer: true })
          .every((origen) => origen.startsWith('https://')),
      inject: [ConfigService],
    },
    { provide: OPCIONES_LIMITE_HTTP, useValue: { maximo: PETICIONES_POR_MINUTO } },
    OrigenGuard,
  ],
  exports: [CuentasService, OrigenGuard, ORIGENES_PERMITIDOS],
})
export class CuentasModule {}
