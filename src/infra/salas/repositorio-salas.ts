import type { Estado } from '../../core/estado/tipos.js';

export interface JugadorDeSala {
  readonly id: string;
  readonly nombre: string;
  /** SHA-256 del token de sesión: el token en claro solo lo tiene su jugador. */
  readonly tokenHash: string;
  /** La cuenta de quien juega, si había iniciado sesión; los invitados no la tienen. */
  readonly usuarioId?: string;
}

/** Lo que se guarda de una sala (con su partida si ya empezó). Es JSON puro. */
export interface SalaGuardada {
  readonly id: string;
  readonly anfitrion: string;
  readonly jugadores: readonly JugadorDeSala[];
  readonly partidaId: string | null;
  /** Se ve en la lista de salas abiertas. */
  readonly publica: boolean;
  /** Reglas elegidas en la sala de espera; se aplican al empezar. */
  readonly opciones: Readonly<Record<string, unknown>>;
  readonly estado: Estado | null;
  /** Milisegundos desde la época. */
  readonly actualizadaEn: number;
}

/** Puerto de salida: dónde viven las salas entre reinicios. */
export abstract class RepositorioSalas {
  abstract guardar(sala: SalaGuardada): Promise<void>;
  abstract cargarTodas(): Promise<SalaGuardada[]>;
  abstract eliminar(id: string): Promise<void>;
}
