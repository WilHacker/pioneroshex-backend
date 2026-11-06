import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { LimiteHttpGuard } from './limite-http.guard.js';
import { esquemaCrearSala, esquemaEmpezar, esquemaUnirse } from '../../schemas/salas.js';
import { SalasService, type Credencial, type SalaPublica } from './salas.service.js';
import { validar } from './validar.js';

/** `Authorization: Bearer <token>` → `<token>`; cualquier otra cosa da un token vacío (401). */
function tokenDe(cabecera: string | undefined): string {
  const [esquema, token] = (cabecera ?? '').split(' ');
  return esquema === 'Bearer' && token ? token : '';
}

@Controller('salas')
@UseGuards(LimiteHttpGuard)
export class SalasController {
  constructor(@Inject(SalasService) private readonly salas: SalasService) {}

  @Post()
  crear(@Body() cuerpo: unknown): Promise<Credencial> {
    return this.salas.crear(validar(esquemaCrearSala, cuerpo).nombre);
  }

  @Post(':id/unirse')
  unirse(@Param('id') id: string, @Body() cuerpo: unknown): Promise<Credencial> {
    return this.salas.unirse(id, validar(esquemaUnirse, cuerpo).nombre);
  }

  @Get(':id')
  estado(@Param('id') id: string): SalaPublica {
    return this.salas.estado(id);
  }

  @Post(':id/empezar')
  @HttpCode(204)
  async empezar(
    @Param('id') id: string,
    @Headers('authorization') autorizacion: string | undefined,
    @Body() cuerpo: unknown,
  ): Promise<void> {
    await this.salas.empezar(id, tokenDe(autorizacion), validar(esquemaEmpezar, cuerpo ?? {}));
  }
}
