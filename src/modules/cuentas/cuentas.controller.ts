import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Ip,
  Inject,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { EstadisticasDeUsuario } from '../../infra/historial/repositorio-historial.js';
import { LimiteHttpGuard } from '../../infra/http/limite-http.guard.js';
import {
  esquemaCambiarContrasena,
  esquemaConContrasena,
  esquemaEntrar,
  esquemaRecuperar,
  esquemaRegistro,
} from '../../schemas/cuentas.js';
import { validar } from '../juego/validar.js';
import { cookieDeCierre, cookieDeSesion, leerCookie, NOMBRE_COOKIE } from './cookies.js';
import { CuentasService, type UsuarioPublico } from './cuentas.service.js';
import { OrigenGuard } from './origen.guard.js';

/** Lo único que se usa de la respuesta: poner la cookie. */
interface RespuestaConCookie {
  setHeader(nombre: string, valor: string): void;
}

/** Nada de lo que depende de la sesión debe quedarse en una caché compartida. */
const SIN_CACHE = ['Cache-Control', 'no-store'] as const;

/** Si el frontend se sirve por HTTPS, la cookie lleva `Secure`. */
export const COOKIE_SEGURA = Symbol('COOKIE_SEGURA');

@Controller('cuentas')
export class CuentasController {
  constructor(
    @Inject(CuentasService) private readonly cuentas: CuentasService,
    @Inject(COOKIE_SEGURA) private readonly seguro: boolean,
  ) {}

  @Post('registro')
  @Header(...SIN_CACHE)
  @UseGuards(OrigenGuard, LimiteHttpGuard)
  async registro(
    @Body() cuerpo: unknown,
    @Res({ passthrough: true }) res: RespuestaConCookie,
  ): Promise<{ usuario: UsuarioPublico; codigos: string[] }> {
    const { nombre, contrasena, codigoRegistro } = validar(esquemaRegistro, cuerpo);
    const { usuario, token, codigos } = await this.cuentas.registrar(
      nombre,
      contrasena,
      codigoRegistro,
    );
    res.setHeader('Set-Cookie', cookieDeSesion(token, this.seguro));
    return { usuario, codigos };
  }

  @Post('entrar')
  @HttpCode(200)
  @UseGuards(OrigenGuard, LimiteHttpGuard)
  async entrar(
    @Ip() ip: string,
    @Body() cuerpo: unknown,
    @Res({ passthrough: true }) res: RespuestaConCookie,
  ): Promise<{ usuario: UsuarioPublico }> {
    const { nombre, contrasena } = validar(esquemaEntrar, cuerpo);
    const { usuario, token } = await this.cuentas.entrar(nombre, contrasena, ip);
    res.setHeader('Set-Cookie', cookieDeSesion(token, this.seguro));
    return { usuario };
  }

  @Post('salir')
  @HttpCode(204)
  @UseGuards(OrigenGuard)
  async salir(
    @Headers('cookie') cookie: string | undefined,
    @Res({ passthrough: true }) res: RespuestaConCookie,
  ): Promise<void> {
    await this.cuentas.salir(leerCookie(cookie, NOMBRE_COOKIE));
    res.setHeader('Set-Cookie', cookieDeCierre(this.seguro));
  }

  @Get('yo/estadisticas')
  @Header(...SIN_CACHE)
  async estadisticas(
    @Headers('cookie') cookie: string | undefined,
  ): Promise<EstadisticasDeUsuario> {
    const usuario = await this.usuarioActual(cookie);
    return this.cuentas.estadisticas(usuario.id);
  }

  @Get('yo')
  @Header(...SIN_CACHE)
  yo(@Headers('cookie') cookie: string | undefined): Promise<UsuarioPublico> {
    return this.usuarioActual(cookie);
  }

  /** Cambia la contraseña con un código de recuperación y deja la sesión abierta. */
  @Post('recuperar')
  @Header(...SIN_CACHE)
  @HttpCode(200)
  @UseGuards(OrigenGuard, LimiteHttpGuard)
  async recuperar(
    @Ip() ip: string,
    @Body() cuerpo: unknown,
    @Res({ passthrough: true }) res: RespuestaConCookie,
  ): Promise<{ usuario: UsuarioPublico; codigosRestantes: number }> {
    const { nombre, codigo, nuevaContrasena } = validar(esquemaRecuperar, cuerpo);
    const { usuario, token, codigosRestantes } = await this.cuentas.recuperar(
      nombre,
      codigo,
      nuevaContrasena,
      ip,
    );
    res.setHeader('Set-Cookie', cookieDeSesion(token, this.seguro));
    return { usuario, codigosRestantes };
  }

  @Post('contrasena')
  @HttpCode(204)
  @UseGuards(OrigenGuard, LimiteHttpGuard)
  async cambiarContrasena(
    @Ip() ip: string,
    @Headers('cookie') cookie: string | undefined,
    @Body() cuerpo: unknown,
    @Res({ passthrough: true }) res: RespuestaConCookie,
  ): Promise<void> {
    const usuario = await this.usuarioActual(cookie);
    const { actual, nueva } = validar(esquemaCambiarContrasena, cuerpo);
    const token = await this.cuentas.cambiarContrasena(usuario.id, actual, nueva, ip);
    res.setHeader('Set-Cookie', cookieDeSesion(token, this.seguro));
  }

  @Get('codigos')
  @Header(...SIN_CACHE)
  async codigos(@Headers('cookie') cookie: string | undefined): Promise<{ restantes: number }> {
    const usuario = await this.usuarioActual(cookie);
    return { restantes: await this.cuentas.codigosRestantes(usuario.id) };
  }

  /** Códigos nuevos (los de antes dejan de servir); se muestran una sola vez. */
  @Post('codigos')
  @Header(...SIN_CACHE)
  @HttpCode(200)
  @UseGuards(OrigenGuard, LimiteHttpGuard)
  async regenerarCodigos(
    @Ip() ip: string,
    @Headers('cookie') cookie: string | undefined,
    @Body() cuerpo: unknown,
  ): Promise<{ codigos: string[] }> {
    const usuario = await this.usuarioActual(cookie);
    const { contrasena } = validar(esquemaConContrasena, cuerpo);
    return { codigos: await this.cuentas.regenerarCodigos(usuario.id, contrasena, ip) };
  }

  @Delete('yo')
  @HttpCode(204)
  @UseGuards(OrigenGuard, LimiteHttpGuard)
  async borrar(
    @Ip() ip: string,
    @Headers('cookie') cookie: string | undefined,
    @Body() cuerpo: unknown,
    @Res({ passthrough: true }) res: RespuestaConCookie,
  ): Promise<void> {
    const usuario = await this.usuarioActual(cookie);
    const { contrasena } = validar(esquemaConContrasena, cuerpo);
    await this.cuentas.borrarCuenta(usuario.id, contrasena, ip);
    res.setHeader('Set-Cookie', cookieDeCierre(this.seguro));
  }

  private async usuarioActual(cookie: string | undefined): Promise<UsuarioPublico> {
    const usuario = await this.cuentas.usuarioDeSesion(leerCookie(cookie, NOMBRE_COOKIE));
    if (!usuario) throw new UnauthorizedException('No has iniciado sesión');
    return usuario;
  }
}
