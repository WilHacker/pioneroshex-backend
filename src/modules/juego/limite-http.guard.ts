import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { crearLimitador } from './limitador.js';

interface Entrada {
  readonly permitir: () => boolean;
  ultimaVez: number;
}

export const OPCIONES_LIMITE_HTTP = Symbol('OPCIONES_LIMITE_HTTP');

export interface OpcionesLimiteHttp {
  readonly maximo?: number;
  readonly ventanaMs?: number;
  readonly ahora?: () => number;
  readonly maxDirecciones?: number;
}

/**
 * Límite de peticiones HTTP por dirección IP (reutiliza el limitador de los sockets).
 * Protege crear sala y unirse de quien las llame en bucle; el registro de usuarios lo necesitará.
 */
@Injectable()
export class LimiteHttpGuard implements CanActivate {
  private readonly entradas = new Map<string, Entrada>();

  private readonly maximo: number;
  private readonly ventanaMs: number;
  private readonly ahora: () => number;
  private readonly maxDirecciones: number;

  /** Sin opciones usa los valores de producción; las pruebas inyectan un reloj propio. */
  constructor(@Optional() @Inject(OPCIONES_LIMITE_HTTP) opciones?: OpcionesLimiteHttp) {
    this.maximo = opciones?.maximo ?? 20;
    this.ventanaMs = opciones?.ventanaMs ?? 60_000;
    this.ahora = opciones?.ahora ?? Date.now;
    this.maxDirecciones = opciones?.maxDirecciones ?? 10_000;
  }

  canActivate(contexto: ExecutionContext): boolean {
    const { ip } = contexto.switchToHttp().getRequest<{ ip?: string }>();
    const clave = ip ?? 'desconocida';
    const ahoraMs = this.ahora();
    if (this.entradas.size >= this.maxDirecciones) this.olvidarInactivas(ahoraMs);

    const entrada = this.entradas.get(clave) ?? {
      permitir: crearLimitador(this.maximo, this.ventanaMs, this.ahora),
      ultimaVez: ahoraMs,
    };
    entrada.ultimaVez = ahoraMs;
    this.entradas.set(clave, entrada);

    if (!entrada.permitir()) {
      throw new HttpException('Demasiadas peticiones', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  tamano(): number {
    return this.entradas.size;
  }

  private olvidarInactivas(ahoraMs: number): void {
    for (const [clave, entrada] of this.entradas) {
      if (ahoraMs - entrada.ultimaVez >= this.ventanaMs) this.entradas.delete(clave);
    }
  }
}
