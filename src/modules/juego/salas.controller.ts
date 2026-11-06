import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { LimiteHttpGuard } from './limite-http.guard.js';
import {
  esquemaCambiarSala,
  esquemaCrearSala,
  esquemaEmpezar,
  esquemaUnirse,
} from '../../schemas/salas.js';
import {
  SalasService,
  type Credencial,
  type ResumenDeSalas,
  type SalaAbierta,
  type SalaPublica,
} from './salas.service.js';
import { validar } from './validar.js';

/** `Authorization: Bearer <token>` → `<token>`; cualquier otra cosa da un token vacío (401). */
function tokenDe(cabecera: string | undefined): string {
  const [esquema, token] = (cabecera ?? '').split(' ');
  return esquema === 'Bearer' && token ? token : '';
}

// El límite por IP solo va en lo que escribe: la sala de espera consulta GET cada pocos segundos.
@Controller('salas')
export class SalasController {
  constructor(@Inject(SalasService) private readonly salas: SalasService) {}

  @Post()
  @UseGuards(LimiteHttpGuard)
  crear(@Body() cuerpo: unknown): Promise<Credencial> {
    const { nombre, publica } = validar(esquemaCrearSala, cuerpo);
    return this.salas.crear(nombre, publica);
  }

  // Antes de ':id' y de 'resumen' por la misma razón: el orden decide qué ruta gana.
  @Get()
  abiertas(): SalaAbierta[] {
    return this.salas.abiertas();
  }

  @Post(':id/unirse')
  @UseGuards(LimiteHttpGuard)
  unirse(@Param('id') id: string, @Body() cuerpo: unknown): Promise<Credencial> {
    return this.salas.unirse(id, validar(esquemaUnirse, cuerpo).nombre);
  }

  // Antes de ':id', si no 'resumen' se tomaría por un id de sala.
  @Get('resumen')
  resumen(): ResumenDeSalas {
    return this.salas.resumen();
  }

  @Get(':id')
  estado(@Param('id') id: string): SalaPublica {
    return this.salas.estado(id);
  }

  @Patch(':id')
  @HttpCode(204)
  @UseGuards(LimiteHttpGuard)
  async cambiar(
    @Param('id') id: string,
    @Headers('authorization') autorizacion: string | undefined,
    @Body() cuerpo: unknown,
  ): Promise<void> {
    await this.salas.cambiar(id, tokenDe(autorizacion), validar(esquemaCambiarSala, cuerpo ?? {}));
  }

  @Post(':id/empezar')
  @HttpCode(204)
  @UseGuards(LimiteHttpGuard)
  async empezar(
    @Param('id') id: string,
    @Headers('authorization') autorizacion: string | undefined,
    @Body() cuerpo: unknown,
  ): Promise<void> {
    await this.salas.empezar(id, tokenDe(autorizacion), validar(esquemaEmpezar, cuerpo ?? {}));
  }
}
