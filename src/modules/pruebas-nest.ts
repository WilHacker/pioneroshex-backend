import type { ModuleMetadata } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { validarEnv } from '../config/env.schema.js';
import { RepositorioCuentas } from '../infra/cuentas/repositorio-cuentas.js';
import { RepositorioCuentasMemoria } from '../infra/cuentas/repositorio-cuentas.memoria.js';
import { RepositorioHistorial } from '../infra/historial/repositorio-historial.js';
import { RepositorioHistorialMemoria } from '../infra/historial/repositorio-historial.memoria.js';

export const ORIGEN_DE_PRUEBA = 'http://localhost:3000';

/**
 * Un módulo de Nest para pruebas sin base de datos: configuración falsa y cuentas e historial en
 * memoria. Quien lo use puede añadir sus propios `overrideProvider` (p. ej. las salas).
 */
export function moduloDePrueba(
  imports: NonNullable<ModuleMetadata['imports']>,
  entorno: Record<string, unknown> = {},
): TestingModuleBuilder {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        validate: () =>
          validarEnv({
            DATABASE_URL: 'postgresql://x:y@localhost/z',
            FRONTEND_URL: ORIGEN_DE_PRUEBA,
            ...entorno,
          }),
      }),
      ...imports,
    ],
  })
    .overrideProvider(RepositorioCuentas)
    .useValue(new RepositorioCuentasMemoria())
    .overrideProvider(RepositorioHistorial)
    .useValue(new RepositorioHistorialMemoria());
}
