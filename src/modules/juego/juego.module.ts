import { Module } from '@nestjs/common';
import { RepositorioSalasPrisma } from '../../infra/prisma/repositorio-salas.prisma.js';
import { RepositorioSalas } from '../../infra/salas/repositorio-salas.js';
import { JuegoGateway } from './juego.gateway.js';
import { OPCIONES_LIMITE_HTTP } from './limite-http.guard.js';
import { PartidasService } from './partidas.service.js';
import { SalasController } from './salas.controller.js';
import { SalasService } from './salas.service.js';

@Module({
  controllers: [SalasController],
  providers: [
    // Fábricas a propósito: estos servicios reciben números y puertos que Nest no puede inyectar.
    { provide: PartidasService, useFactory: () => new PartidasService() },
    { provide: RepositorioSalas, useClass: RepositorioSalasPrisma },
    {
      provide: SalasService,
      useFactory: (partidas: PartidasService, repositorio: RepositorioSalas) =>
        new SalasService(partidas, repositorio),
      inject: [PartidasService, RepositorioSalas],
    },
    // Valores por defecto del límite HTTP (20 por minuto por IP); las pruebas lo sustituyen.
    { provide: OPCIONES_LIMITE_HTTP, useValue: {} },
    JuegoGateway,
  ],
  exports: [PartidasService, SalasService],
})
export class JuegoModule {}
