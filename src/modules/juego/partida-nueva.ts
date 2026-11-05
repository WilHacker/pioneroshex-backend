import { randomBytes } from 'node:crypto';
import { crearPartida } from '../../core/estado/crear.js';
import { crearMesa, type Mesa } from '../../core/estado/mesa.js';
import type { Estado, JugadorId } from '../../core/estado/tipos.js';
import { crearGameConfig, type GameConfigEntrada } from '../../core/partida/game-config.js';

/** Devuelve `bytes` bytes de entropía en hexadecimal. Se inyecta solo para probar. */
export type GeneradorDeSemilla = (bytes: number) => string;

/**
 * Lo que el anfitrión puede fijar. La `semillaAzar` no está: la genera siempre el servidor y no
 * puede venir de un cliente. El número de jugadores sale de la lista de ids.
 */
export type OpcionesPartida = Partial<Omit<GameConfigEntrada, 'semillaAzar' | 'jugadores'>>;

const BYTES_SEMILLA_MAPA = 4;
const BYTES_SEMILLA_AZAR = 16;

const semillaSegura: GeneradorDeSemilla = (bytes) => randomBytes(bytes).toString('hex');

/**
 * Crea una partida nueva. La `semillaAzar` (dados, mazo, robos) sale de un generador seguro y no
 * se deriva de nada público; la `semillaMapa` es pública y el anfitrión puede fijarla.
 * `core/` es puro y no puede generar entropía, por eso esto vive aquí.
 */
export function crearPartidaNueva(
  jugadores: readonly JugadorId[],
  opciones: OpcionesPartida = {},
  generar: GeneradorDeSemilla = semillaSegura,
): { readonly mesa: Mesa; readonly estado: Estado } {
  const semillaMapa = opciones.semillaMapa ?? generar(BYTES_SEMILLA_MAPA);
  const config = crearGameConfig({
    ...opciones,
    semillaMapa,
    semillaAzar: generar(BYTES_SEMILLA_AZAR),
    jugadores: jugadores.length,
  });
  const mesa = crearMesa(config);
  return { mesa, estado: crearPartida(mesa, jugadores) };
}
