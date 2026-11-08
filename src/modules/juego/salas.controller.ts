import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Delete,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CuentasService } from '../cuentas/cuentas.service.js';
import { OrigenGuard } from '../cuentas/origen.guard.js';
import { LimiteHttpGuard } from '../../infra/http/limite-http.guard.js';
import {
  esquemaCambiarSala,
  esquemaCederAnfitrion,
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
  constructor(
    @Inject(SalasService) private readonly salas: SalasService,
    @Inject(CuentasService) private readonly cuentas: CuentasService,
  ) {}

  // Estas dos leen la cookie de sesión: el guard de origen va primero para que otra página no
  // pueda ni gastar la cuota de peticiones de la víctima.
  @Post()
  @UseGuards(OrigenGuard, LimiteHttpGuard)
  async crear(
    @Body() cuerpo: unknown,
    @Headers('cookie') cookie: string | undefined,
  ): Promise<Credencial> {
    const { nombre, publica, ...reglas } = validar(esquemaCrearSala, cuerpo);
    // Con sesión iniciada, el jugador es su cuenta y se usa el nombre de la cuenta.
    const usuario = await this.cuentas.usuarioDeCookie(cookie);
    return this.salas.crear(usuario?.nombre ?? nombre, publica, usuario?.id, reglas);
  }

  // Antes de ':id' y de 'resumen' por la misma razón: el orden decide qué ruta gana.
  @Get()
  abiertas(): SalaAbierta[] {
    return this.salas.abiertas();
  }

  @Post(':id/unirse')
  @UseGuards(OrigenGuard, LimiteHttpGuard)
  async unirse(
    @Param('id') id: string,
    @Body() cuerpo: unknown,
    @Headers('cookie') cookie: string | undefined,
  ): Promise<Credencial> {
    const { nombre } = validar(esquemaUnirse, cuerpo);
    const usuario = await this.cuentas.usuarioDeCookie(cookie);
    return this.salas.unirse(id, usuario?.nombre ?? nombre, usuario?.id);
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

  @Post(':id/salir')
  @HttpCode(204)
  @UseGuards(LimiteHttpGuard)
  async salir(
    @Param('id') id: string,
    @Headers('authorization') autorizacion: string | undefined,
  ): Promise<void> {
    await this.salas.salir(id, tokenDe(autorizacion));
  }

  @Delete(':id/jugadores/:jugadorId')
  @HttpCode(204)
  @UseGuards(LimiteHttpGuard)
  async expulsar(
    @Param('id') id: string,
    @Param('jugadorId') jugadorId: string,
    @Headers('authorization') autorizacion: string | undefined,
  ): Promise<void> {
    await this.salas.expulsar(id, tokenDe(autorizacion), jugadorId);
  }

  @Post(':id/anfitrion')
  @HttpCode(204)
  @UseGuards(LimiteHttpGuard)
  async cederAnfitrion(
    @Param('id') id: string,
    @Headers('authorization') autorizacion: string | undefined,
    @Body() cuerpo: unknown,
  ): Promise<void> {
    const { jugadorId } = validar(esquemaCederAnfitrion, cuerpo);
    await this.salas.cederAnfitrion(id, tokenDe(autorizacion), jugadorId);
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
