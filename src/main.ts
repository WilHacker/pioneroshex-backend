import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.schema.js';

async function arrancar(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.use(helmet());
  app.enableCors({ origin: config.get('FRONTEND_URL', { infer: true }), credentials: true });
  app.enableShutdownHooks();

  const puerto = config.get('PORT', { infer: true });
  await app.listen(puerto);
  new Logger('Arranque').log(`Servidor escuchando en el puerto ${puerto}`);
}

arrancar().catch((error: unknown) => {
  const mensaje = error instanceof Error ? error.message : String(error);
  new Logger('Arranque').error(`No se pudo iniciar el servidor: ${mensaje}`);
  process.exit(1);
});
