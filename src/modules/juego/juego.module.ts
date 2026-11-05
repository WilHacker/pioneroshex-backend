import { Module } from '@nestjs/common';
import { PartidasService } from './partidas.service.js';

@Module({
  // Fábrica a propósito: `PartidasService` recibe el tope como número, que Nest no puede inyectar.
  providers: [{ provide: PartidasService, useFactory: () => new PartidasService() }],
  exports: [PartidasService],
})
export class JuegoModule {}
