import { randomBytes } from 'node:crypto';
import { PartidaActor } from './partida-actor.js';
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

  /** Crea una partida con su actor. Lanza si el motor la rechaza o si se llegó al tope. */
  crear(
    jugadores: readonly string[],
    opciones: OpcionesPartida = {},
  ): { readonly id: string; readonly actor: PartidaActor } {
    if (this.partidas.size >= this.limite) throw new LimiteDePartidasError(this.limite);
    const { mesa, estado } = crearPartidaNueva(jugadores, opciones);
    const id = crearIdDeSala((candidato) => this.partidas.has(candidato));
    const actor = new PartidaActor(mesa, estado);
    this.partidas.set(id, actor);
    return { id, actor };
  }

  obtener(id: string): PartidaActor | undefined {
    return this.partidas.get(id);
  }

  /** Devuelve `true` si existía. */
  eliminar(id: string): boolean {
    return this.partidas.delete(id);
  }
}
