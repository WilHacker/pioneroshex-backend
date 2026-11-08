import { BadRequestException, Controller, Get, Param } from '@nestjs/common';
import { recomendadoPara, type Recomendado } from '../../core/partida/recomendado.js';

/** Los ajustes que conviene proponer según cuántos jugadores tendrá la sala. */
@Controller('recomendado')
export class RecomendadoController {
  @Get(':jugadores')
  para(@Param('jugadores') jugadores: string): Recomendado {
    // Solo dígitos: `Number('1e1')` o `Number(' 6')` darían un número y aquí no se aceptan.
    if (!/^\d{1,2}$/.test(jugadores)) {
      throw new BadRequestException('jugadores debe ser un número entero');
    }
    try {
      return recomendadoPara(Number(jugadores));
    } catch (error: unknown) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Número no válido');
    }
  }
}
