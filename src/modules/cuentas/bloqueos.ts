import { HttpException, HttpStatus } from '@nestjs/common';

export interface OpcionesBloqueos {
  /** Intentos fallidos permitidos para un mismo nombre desde una misma dirección. */
  readonly porOrigen?: number;
  /** Intentos fallidos permitidos para un mismo nombre sumando todas las direcciones. */
  readonly global?: number;
  readonly ventanaMs?: number;
  readonly entradasMax?: number;
}

interface Registro {
  desde: number;
  cuantos: number;
}

const POR_ORIGEN = 5;
const GLOBAL = 50;
const VENTANA_MS = 15 * 60 * 1000;
const ENTRADAS_MAX = 10_000;

/**
 * Límite de intentos por cuenta. Cada intento se **reserva antes** de gastar tiempo en `scrypt`
 * (así cien peticiones a la vez no pasan todas con el contador a cero) y se devuelve si acierta.
 *
 * El límite estricto es por nombre **y dirección**: quien adivina contraseñas se bloquea a sí
 * mismo, pero no puede dejar fuera a la dueña de la cuenta desde otra red. Aparte hay un tope más
 * alto por nombre entre todas las direcciones, contra ataques repartidos.
 */
export class Bloqueos {
  private readonly registros = new Map<string, Registro>();
  private readonly porOrigen: number;
  private readonly global: number;
  private readonly ventanaMs: number;
  private readonly entradasMax: number;

  constructor(
    private readonly ahora: () => number = Date.now,
    opciones: OpcionesBloqueos = {},
  ) {
    this.porOrigen = opciones.porOrigen ?? POR_ORIGEN;
    this.global = opciones.global ?? GLOBAL;
    this.ventanaMs = opciones.ventanaMs ?? VENTANA_MS;
    this.entradasMax = opciones.entradasMax ?? ENTRADAS_MAX;
  }

  /** Lanza 429 si ya no quedan intentos; si no, cuenta uno y devuelve cómo devolverlo. */
  reservar(nombre: string, origen: string): () => void {
    const ahora = this.ahora();
    if (this.registros.size >= this.entradasMax) this.olvidarVencidos(ahora);
    const claveOrigen = `o|${nombre}|${origen}`;
    const claveGlobal = `g|${nombre}`;
    const delOrigen = this.vigente(claveOrigen, ahora);
    const global = this.vigente(claveGlobal, ahora);
    if ((delOrigen?.cuantos ?? 0) >= this.porOrigen || (global?.cuantos ?? 0) >= this.global) {
      throw new HttpException(
        'Demasiados intentos: espera unos minutos',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.sumar(claveOrigen, delOrigen, ahora);
    this.sumar(claveGlobal, global, ahora);
    return () => {
      this.registros.delete(claveOrigen);
      const actual = this.registros.get(claveGlobal);
      if (actual && actual.cuantos > 1) actual.cuantos -= 1;
      else this.registros.delete(claveGlobal);
    };
  }

  tamano(): number {
    return this.registros.size;
  }

  private vigente(clave: string, ahora: number): Registro | undefined {
    const registro = this.registros.get(clave);
    if (registro && ahora - registro.desde >= this.ventanaMs) {
      this.registros.delete(clave);
      return undefined;
    }
    return registro;
  }

  private sumar(clave: string, actual: Registro | undefined, ahora: number): void {
    if (actual) actual.cuantos += 1;
    else this.registros.set(clave, { desde: ahora, cuantos: 1 });
  }

  private olvidarVencidos(ahora: number): void {
    for (const [clave, registro] of this.registros) {
      if (ahora - registro.desde >= this.ventanaMs) this.registros.delete(clave);
    }
  }
}
