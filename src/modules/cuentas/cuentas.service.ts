import { randomUUID, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  RepositorioCuentas,
  type UsuarioGuardado,
} from '../../infra/cuentas/repositorio-cuentas.js';
import type {
  EstadisticasDeUsuario,
  RepositorioHistorial,
} from '../../infra/historial/repositorio-historial.js';
import { Bloqueos } from './bloqueos.js';
import { generarCodigos, hashCodigo, hashToken, normalizarCodigo, nuevoToken } from './codigos.js';
import { hashContrasena, verificarContrasena } from './contrasenas.js';
import { leerCookie, NOMBRE_COOKIE } from './cookies.js';

const DIA_MS = 24 * 60 * 60 * 1000;
/** Una sesión dura 30 días desde su último uso. */
export const DURACION_SESION_MS = 30 * DIA_MS;
/** Se renueva como mucho una vez al día, para no escribir en la base en cada petición. */
const RENOVAR_DESPUES_DE_MS = DIA_MS;
const BARRIDO_CADA_MS = 60 * 60 * 1000;
/** Intentos fallidos por nombre y dirección antes de bloquear (ver `Bloqueos`). */
export const INTENTOS_MAX = 5;
/** Lo que dura ese bloqueo. */
export const VENTANA_BLOQUEO_MS = 15 * 60 * 1000;
/** Para llamadas sin dirección (pruebas, tareas internas). */
const SIN_ORIGEN = 'local';
const MENSAJE_CREDENCIALES = 'Nombre o contraseña incorrectos';
const MENSAJE_RECUPERACION = 'Nombre o código incorrectos';

export interface UsuarioPublico {
  readonly id: string;
  readonly nombre: string;
}

export interface OpcionesCuentas {
  /** Reloj en milisegundos; se inyecta solo para probar. */
  readonly ahora?: () => number;
  /** Si existe, hace falta para crear una cuenta (registro cerrado). */
  readonly codigoRegistro?: string | undefined;
  /** Dónde están los resultados de las partidas; sin él no hay estadísticas. */
  readonly historial?: RepositorioHistorial | undefined;
}

/**
 * Forma canónica del nombre: NFKC (las letras de ancho completo y otras variantes se igualan a las
 * normales), espacios colapsados y minúsculas. «Ana», «ＡＮＡ» y « ana  » son la misma persona.
 */
export const normalizarNombre = (nombre: string): string =>
  nombre.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

const iguales = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Cuentas con nombre y contraseña. Las sesiones viajan en una cookie con un token aleatorio; en la
 * base solo vive su hash. No hay correo: la recuperación usa códigos de un solo uso.
 */
@Injectable()
export class CuentasService implements OnModuleInit, OnModuleDestroy {
  private readonly ahora: () => number;
  private readonly codigoRegistro: string | undefined;
  private readonly historial: RepositorioHistorial | undefined;
  private readonly bloqueos: Bloqueos;
  /** Un hash válido que no es de nadie: se verifica contra él cuando el nombre no existe. */
  private readonly hashFalso: Promise<string>;
  private temporizador: NodeJS.Timeout | undefined;

  constructor(
    private readonly repositorio: RepositorioCuentas,
    opciones: OpcionesCuentas = {},
  ) {
    this.ahora = opciones.ahora ?? Date.now;
    this.codigoRegistro = opciones.codigoRegistro;
    this.historial = opciones.historial;
    this.bloqueos = new Bloqueos(this.ahora, {
      porOrigen: INTENTOS_MAX,
      ventanaMs: VENTANA_BLOQUEO_MS,
    });
    this.hashFalso = hashContrasena(nuevoToken());
    // Si nadie lo usa (pruebas), un fallo al calcularlo no debe tumbar el proceso.
    this.hashFalso.catch(() => undefined);
  }

  onModuleInit(): void {
    this.temporizador = setInterval(
      () => void this.barrer().catch(() => undefined),
      BARRIDO_CADA_MS,
    );
    this.temporizador.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.temporizador);
  }

  async registrar(
    nombre: string,
    contrasena: string,
    codigoRegistro?: string,
  ): Promise<{ usuario: UsuarioPublico; token: string; codigos: string[] }> {
    if (this.codigoRegistro !== undefined && !iguales(codigoRegistro ?? '', this.codigoRegistro)) {
      throw new ForbiddenException('El registro está cerrado: hace falta el código de la casa');
    }
    const limpio = nombre.replace(/\s+/g, ' ').trim();
    const usuario: UsuarioPublico = { id: randomUUID(), nombre: limpio };
    const creada = await this.repositorio.crearUsuario({
      ...usuario,
      nombreNorm: normalizarNombre(limpio),
      hashContrasena: await hashContrasena(contrasena),
      creadoEn: this.ahora(),
    });
    if (!creada) throw new ConflictException('Ese nombre ya está en uso');

    const codigos = generarCodigos();
    await this.repositorio.reemplazarCodigos(
      usuario.id,
      codigos.map((c) => hashCodigo(c)),
    );
    return { usuario, token: await this.abrirSesion(usuario.id), codigos };
  }

  async entrar(
    nombre: string,
    contrasena: string,
    origen = SIN_ORIGEN,
  ): Promise<{ usuario: UsuarioPublico; token: string }> {
    const norm = normalizarNombre(nombre);
    // El intento se cuenta ya, antes de esperar a la base o a scrypt: así no hay carreras.
    const devolverIntento = this.bloqueos.reservar(norm, origen);
    const guardado = await this.repositorio.usuarioPorNombre(norm);
    // Con un usuario inexistente se gasta el mismo tiempo de `scrypt` que con uno real.
    const correcta = await verificarContrasena(
      contrasena,
      guardado?.hashContrasena ?? (await this.hashFalso),
    );
    if (!guardado || !correcta) throw new UnauthorizedException(MENSAJE_CREDENCIALES);
    devolverIntento();
    return {
      usuario: { id: guardado.id, nombre: guardado.nombre },
      token: await this.abrirSesion(guardado.id),
    };
  }

  /**
   * Cambia la contraseña con uno de los códigos de recuperación. Cierra todas las sesiones de la
   * cuenta y abre una nueva. Adivinar códigos cuenta como adivinar contraseñas.
   */
  async recuperar(
    nombre: string,
    codigo: string,
    nuevaContrasena: string,
    origen = SIN_ORIGEN,
  ): Promise<{ usuario: UsuarioPublico; token: string; codigosRestantes: number }> {
    const norm = normalizarNombre(nombre);
    const devolverIntento = this.bloqueos.reservar(norm, origen);
    // El scrypt va siempre primero: así tarda lo mismo exista la cuenta o no.
    const hashNuevo = await hashContrasena(nuevaContrasena);
    const guardado = await this.repositorio.usuarioPorNombre(norm);
    const normalizado = normalizarCodigo(codigo);
    const gastado =
      guardado !== null &&
      normalizado !== null &&
      (await this.repositorio.gastarCodigo(guardado.id, hashCodigo(normalizado), this.ahora()));
    if (!guardado || !gastado) throw new UnauthorizedException(MENSAJE_RECUPERACION);
    devolverIntento();
    await this.repositorio.actualizarContrasena(guardado.id, hashNuevo);
    await this.repositorio.borrarSesionesDe(guardado.id);
    return {
      usuario: { id: guardado.id, nombre: guardado.nombre },
      token: await this.abrirSesion(guardado.id),
      codigosRestantes: await this.repositorio.codigosSinUsar(guardado.id),
    };
  }

  /** Con sesión iniciada: cambia la contraseña y deja solo la sesión nueva que se devuelve. */
  async cambiarContrasena(
    usuarioId: string,
    actual: string,
    nueva: string,
    origen = SIN_ORIGEN,
  ): Promise<string> {
    if (nueva === actual) throw new BadRequestException('La contraseña nueva es igual a la actual');
    const usuario = await this.verificarActual(usuarioId, actual, origen);
    await this.repositorio.actualizarContrasena(usuario.id, await hashContrasena(nueva));
    await this.repositorio.borrarSesionesDe(usuario.id);
    return this.abrirSesion(usuario.id);
  }

  /** Ocho códigos nuevos; los anteriores dejan de servir. Se entregan una sola vez. */
  async regenerarCodigos(
    usuarioId: string,
    contrasena: string,
    origen = SIN_ORIGEN,
  ): Promise<string[]> {
    const usuario = await this.verificarActual(usuarioId, contrasena, origen);
    const codigos = generarCodigos();
    await this.repositorio.reemplazarCodigos(
      usuario.id,
      codigos.map((c) => hashCodigo(c)),
    );
    return codigos;
  }

  codigosRestantes(usuarioId: string): Promise<number> {
    return this.repositorio.codigosSinUsar(usuarioId);
  }

  /** Borra la cuenta con sus sesiones y códigos; el nombre queda libre. */
  async borrarCuenta(usuarioId: string, contrasena: string, origen = SIN_ORIGEN): Promise<void> {
    const usuario = await this.verificarActual(usuarioId, contrasena, origen);
    // Sus partidas se quedan (los demás las jugaron también) pero sin su nombre de cuenta.
    await this.historial?.desvincularUsuario(usuario.id);
    await this.repositorio.borrarUsuario(usuario.id);
  }

  /** Partidas, victorias y las últimas jugadas; todo en cero si no hay historial. */
  async estadisticas(usuarioId: string): Promise<EstadisticasDeUsuario> {
    return (
      (await this.historial?.estadisticasDe(usuarioId)) ?? {
        partidas: 0,
        victorias: 0,
        promedioPuntos: 0,
        ultimas: [],
      }
    );
  }

  async salir(token: string | undefined): Promise<void> {
    if (token) await this.repositorio.borrarSesion(hashToken(token));
  }

  /** Lo mismo que `usuarioDeSesion`, a partir de la cabecera `Cookie` completa de la petición. */
  usuarioDeCookie(cabecera: string | undefined): Promise<UsuarioPublico | undefined> {
    return this.usuarioDeSesion(leerCookie(cabecera, NOMBRE_COOKIE));
  }

  /** Quién es el dueño del token, o `undefined` si no hay sesión válida. */
  async usuarioDeSesion(token: string | undefined): Promise<UsuarioPublico | undefined> {
    if (!token) return undefined;
    const hash = hashToken(token);
    const sesion = await this.repositorio.sesionPorHash(hash);
    if (!sesion) return undefined;
    const ahora = this.ahora();
    if (sesion.expiraEn <= ahora) {
      await this.repositorio.borrarSesion(hash);
      return undefined;
    }
    const usuario = await this.repositorio.usuarioPorId(sesion.usuarioId);
    if (!usuario) {
      await this.repositorio.borrarSesion(hash);
      return undefined;
    }
    if (sesion.expiraEn - ahora < DURACION_SESION_MS - RENOVAR_DESPUES_DE_MS) {
      // Solo actualiza: si otra petición cerró esta sesión mientras tanto, no la resucita.
      await this.repositorio.renovarSesion(hash, ahora + DURACION_SESION_MS);
    }
    return { id: usuario.id, nombre: usuario.nombre };
  }

  /** Borra las sesiones vencidas; lo llama un temporizador. */
  barrer(): Promise<void> {
    return this.repositorio.borrarSesionesVencidas(this.ahora());
  }

  /** Pide la contraseña a quien ya tiene sesión, con el mismo bloqueo por intentos. */
  private async verificarActual(
    usuarioId: string,
    contrasena: string,
    origen: string,
  ): Promise<UsuarioGuardado> {
    const usuario = await this.repositorio.usuarioPorId(usuarioId);
    if (!usuario) throw new UnauthorizedException('No has iniciado sesión');
    const devolverIntento = this.bloqueos.reservar(usuario.nombreNorm, origen);
    if (!(await verificarContrasena(contrasena, usuario.hashContrasena))) {
      throw new UnauthorizedException('Contraseña incorrecta');
    }
    devolverIntento();
    return usuario;
  }

  private async abrirSesion(usuarioId: string): Promise<string> {
    const token = nuevoToken();
    await this.repositorio.guardarSesion({
      tokenHash: hashToken(token),
      usuarioId,
      expiraEn: this.ahora() + DURACION_SESION_MS,
    });
    return token;
  }
}
