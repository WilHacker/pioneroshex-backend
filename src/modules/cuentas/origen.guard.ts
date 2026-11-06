import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';

/** Los orígenes del frontend (`FRONTEND_URL`), ya separados. */
export const ORIGENES_PERMITIDOS = Symbol('ORIGENES_PERMITIDOS');

/**
 * Defensa extra contra CSRF para las rutas que cambian algo con la cookie de sesión: si el
 * navegador dice que la petición viene de otra página, se rechaza. Sin `Origin` (curl, pruebas) no
 * hay navegador que pueda estar siendo engañado, así que pasa.
 */
@Injectable()
export class OrigenGuard implements CanActivate {
  constructor(@Inject(ORIGENES_PERMITIDOS) private readonly permitidos: readonly string[]) {}

  canActivate(contexto: ExecutionContext): boolean {
    const { headers } = contexto
      .switchToHttp()
      .getRequest<{ headers: { origin?: string; 'sec-fetch-site'?: string } }>();
    // Los navegadores modernos lo mandan siempre: `cross-site` es otra página usando tu cookie.
    if (headers['sec-fetch-site'] === 'cross-site')
      throw new ForbiddenException('Origen no permitido');
    const origen = headers.origin;
    if (origen === undefined || this.permitidos.includes(origen)) return true;
    throw new ForbiddenException('Origen no permitido');
  }
}
