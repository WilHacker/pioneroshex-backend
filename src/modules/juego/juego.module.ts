import { Module } from '@nestjs/common';
import { RepositorioHistorial } from '../../infra/historial/repositorio-historial.js';
import { HistorialModule } from '../../infra/prisma/historial.module.js';
import { CuentasModule } from '../cuentas/cuentas.module.js';
import { RepositorioSalasPrisma } from '../../infra/prisma/repositorio-salas.prisma.js';
import { RepositorioSalas } from '../../infra/salas/repositorio-salas.js';
import { JuegoGateway } from './juego.gateway.js';
import { LobbyGateway } from './lobby.gateway.js';
import { MapasController } from './mapas.controller.js';
import { RecomendadoController } from './recomendado.controller.js';
import { OPCIONES_LIMITE_HTTP } from '../../infra/http/limite-http.guard.js';
import { PartidasService } from './partidas.service.js';
import { SalasController } from './salas.controller.js';
import { SalasService } from './salas.service.js';

// CuentasModule es el único módulo que se importa desde otro: las salas necesitan saber quién
// inició sesión. Solo se usa su servicio de lectura de sesiones.
@Module({
  imports: [CuentasModule, HistorialModule],
  controllers: [SalasController, MapasController, RecomendadoController],
  providers: [
    // Fábricas a propósito: estos servicios reciben números y puertos que Nest no puede inyectar.
    { provide: PartidasService, useFactory: () => new PartidasService() },
    { provide: RepositorioSalas, useClass: RepositorioSalasPrisma },
    {
      provide: SalasService,
      useFactory: (
        partidas: PartidasService,
        repositorio: RepositorioSalas,
        historial: RepositorioHistorial,
      ) => new SalasService(partidas, repositorio, { historial }),
      inject: [PartidasService, RepositorioSalas, RepositorioHistorial],
    },
    // Valores por defecto del límite HTTP (20 por minuto por IP); las pruebas lo sustituyen.
    { provide: OPCIONES_LIMITE_HTTP, useValue: {} },
    JuegoGateway,
    LobbyGateway,
  ],
  exports: [PartidasService, SalasService],
})
export class JuegoModule {}
