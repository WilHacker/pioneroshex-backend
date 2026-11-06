import { randomBytes } from 'node:crypto';
import type { Mesa } from '../../core/estado/mesa.js';
import type { Estado } from '../../core/estado/tipos.js';
import { PartidaActor, type OpcionesActor } from './partida-actor.js';
import { crearPartidaNueva, type OpcionesPartida } from './partida-nueva.js';

/** Tope provisional de partidas vivas en memoria; ajustar al medir (ver Backlog). */
export const LIMITE_PARTIDAS_POR_DEFECTO = 1000;

const BYTES_ID_DE_SALA = 4;
const INTENTOS_ID_DE_SALA = 10;

const idAleatorio = (): string => randomBytes(BYTES_ID_DE_SALA).toString('hex');

export class LimiteDePartidasError extends Error {
  constructor(limite: number) {
    super(`Se alcanzó el límite de ${limite} partidas vivas`);
    this.name = 'LimiteDePartidasError';
  }
}

/** Un id corto y legible para compartir; reintenta si ya existe y falla si no encuentra uno libre. */
export function crearIdDeSala(
  ocupado: (id: string) => boolean,
  generar: () => string = idAleatorio,
): string {
  for (let intento = 0; intento < INTENTOS_ID_DE_SALA; intento++) {
    const id = generar();
    if (!ocupado(id)) return id;
  }
  throw new Error(`No se encontró un id de sala libre tras ${INTENTOS_ID_DE_SALA} intentos`);
}

/**
 * Las partidas vivas, por id de sala. Solo guarda y entrega actores: no sabe de sockets, cuentas
 * ni temporizadores. Un id no es un secreto: quien lo conozca aún debe poder entrar según la
 * autenticación que se decida en el gateway. Aquí no se crea nada sin pasar por el tope.
 *
 * Es una clase sin decoradores a propósito: el módulo la construye con una fábrica para que Nest no
 * intente resolver `limite` (un número) como dependencia.
 */
export class PartidasService {
  private readonly partidas = new Map<string, PartidaActor>();

  constructor(private readonly limite: number = LIMITE_PARTIDAS_POR_DEFECTO) {}

  get cantidad(): number {
    return this.partidas.size;
  }

  /**
   * Crea una partida con su actor. Lanza si el motor la rechaza o si se llegó al tope.
   * `opcionesActor` recibe el id nuevo (para que quien guarde sepa dónde); siempre se piden las
   * acciones disponibles porque el cliente las usa para saber qué botones mostrar.
   */
  crear(
    jugadores: readonly string[],
    opciones: OpcionesPartida = {},
    opcionesActor: (id: string) => OpcionesActor = () => ({}),
  ): { readonly id: string; readonly actor: PartidaActor } {
    this.comprobarTope();
    const { mesa, estado } = crearPartidaNueva(jugadores, opciones);
    const id = crearIdDeSala((candidato) => this.partidas.has(candidato));
    const actor = new PartidaActor(mesa, estado, { incluirAcciones: true, ...opcionesActor(id) });
    this.partidas.set(id, actor);
    return { id, actor };
  }

  /** Vuelve a registrar una partida guardada (al arrancar el servidor). */
  restaurar(
    id: string,
    mesa: Mesa,
    estado: Estado,
    opcionesActor: OpcionesActor = {},
  ): PartidaActor {
    if (this.partidas.has(id)) throw new Error(`La partida "${id}" ya existe`);
    this.comprobarTope();
    const actor = new PartidaActor(mesa, estado, { incluirAcciones: true, ...opcionesActor });
    this.partidas.set(id, actor);
    return actor;
  }

  /**
   * Quita las partidas sin nadie conectado y sin jugadas desde hace más de `maxInactivoMs`.
   * Devuelve los ids quitados para que quien las guardó pueda borrarlas también.
   */
  barrer(maxInactivoMs: number, ahora: number = Date.now()): string[] {
    const quitadas: string[] = [];
    for (const [id, actor] of this.partidas) {
      if (actor.suscriptores === 0 && ahora - actor.ultimaActividad > maxInactivoMs) {
        this.partidas.delete(id);
        quitadas.push(id);
      }
    }
    return quitadas;
  }

  private comprobarTope(): void {
    if (this.partidas.size >= this.limite) throw new LimiteDePartidasError(this.limite);
  }

  obtener(id: string): PartidaActor | undefined {
    return this.partidas.get(id);
  }

  /** Devuelve `true` si existía. */
  eliminar(id: string): boolean {
    this.partidas.get(id)?.detener();
    return this.partidas.delete(id);
  }
}
