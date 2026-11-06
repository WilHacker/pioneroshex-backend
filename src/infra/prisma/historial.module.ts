import { Module } from '@nestjs/common';
import { RepositorioHistorial } from '../historial/repositorio-historial.js';
import { RepositorioHistorialPrisma } from './repositorio-historial.prisma.js';

/** El historial de partidas, compartido por quien lo escribe (salas) y quien lo lee (cuentas). */
@Module({
  providers: [{ provide: RepositorioHistorial, useClass: RepositorioHistorialPrisma }],
  exports: [RepositorioHistorial],
})
export class HistorialModule {}
