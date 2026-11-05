import type { Hex } from '../mapa/coordenadas.js';
import type { GameConfig } from '../partida/game-config.js';
import type { Costo, LimitesDePiezas } from '../reglas/costos.js';
import type { Recurso } from '../reglas/recursos.js';

export type JugadorId = string;
export type Fase =
  'PREPARACION_POBLADO' | 'PREPARACION_CAMINO' | 'PRE_TIRADA' | 'FASE_PRINCIPAL' | 'FIN';
export type TipoEdificio = 'POBLADO' | 'CIUDAD';
export interface Edificio {
  readonly dueno: JugadorId;
  readonly tipo: TipoEdificio;
}
export interface Jugador {
  readonly id: JugadorId;
  readonly recursos: Readonly<Record<Recurso, number>>;
  readonly piezasRestantes: LimitesDePiezas;
}
export interface Estado {
  readonly config: GameConfig;
  readonly jugadores: readonly Jugador[]; // en orden de turno
  readonly fase: Fase;
  readonly turnoDe: number; // índice en jugadores
  readonly pasoPreparacion: number; // 0..2n-1 en preparación; 2n después
  readonly pobladoPendiente: string | null; // vértice del poblado inicial sin camino
  readonly edificios: Readonly<Record<string, Edificio>>; // por id de vértice
  readonly caminos: Readonly<Record<string, JugadorId>>; // por id de arista
  readonly banco: Readonly<Record<Recurso, number>>;
  readonly ladron: Hex | null;
  readonly dados: readonly [number, number] | null;
  readonly tiradas: number;
  readonly version: number;
  readonly ganador: JugadorId | null;
}
export type Accion =
  | { tipo: 'COLOCAR_POBLADO_INICIAL'; jugador: JugadorId; vertice: string }
  | { tipo: 'COLOCAR_CAMINO_INICIAL'; jugador: JugadorId; arista: string }
  | { tipo: 'TIRAR_DADOS'; jugador: JugadorId }
  | { tipo: 'CONSTRUIR_CAMINO'; jugador: JugadorId; arista: string }
  | { tipo: 'CONSTRUIR_POBLADO'; jugador: JugadorId; vertice: string }
  | { tipo: 'CONSTRUIR_CIUDAD'; jugador: JugadorId; vertice: string }
  | { tipo: 'TERMINAR_TURNO'; jugador: JugadorId };
export type Origen = 'PREPARACION' | 'CONSTRUCCION';
export interface FuenteProduccion {
  readonly casilla: string;
  readonly vertice: string;
  readonly edificio: TipoEdificio;
  readonly cantidad: number;
}
export type CausaRecursos =
  | { readonly tipo: 'PREPARACION'; readonly vertice: string; readonly casilla: string }
  | {
      readonly tipo: 'PRODUCCION';
      readonly tirada: number;
      readonly fuentes: readonly FuenteProduccion[];
    };
export type Evento =
  | { tipo: 'POBLADO_COLOCADO'; jugador: JugadorId; vertice: string; origen: Origen; costo: Costo }
  | { tipo: 'CAMINO_COLOCADO'; jugador: JugadorId; arista: string; origen: Origen; costo: Costo }
  | { tipo: 'CIUDAD_COLOCADA'; jugador: JugadorId; vertice: string; costo: Costo }
  | { tipo: 'DADOS_TIRADOS'; jugador: JugadorId; dados: readonly [number, number] }
  | {
      tipo: 'RECURSOS_REPARTIDOS';
      jugador: JugadorId;
      recurso: Recurso;
      cantidad: number;
      causa: CausaRecursos;
    }
  | { tipo: 'PRODUCCION_BLOQUEADA'; recurso: Recurso; pedido: number; disponible: number }
  | { tipo: 'FASE_CAMBIADA'; fase: Fase; turnoDe: number; pasoPreparacion: number }
  | { tipo: 'TURNO_TERMINADO'; jugador: JugadorId; siguiente: number }
  | { tipo: 'PARTIDA_GANADA'; jugador: JugadorId; puntos: number };
export type MotivoAccion =
  | 'PARTIDA_TERMINADA'
  | 'JUGADOR_DESCONOCIDO'
  | 'NO_ES_TU_TURNO'
  | 'FASE_INCORRECTA'
  | 'SIN_PIEZAS'
  | 'RECURSOS_INSUFICIENTES'
  | 'VERTICE_INEXISTENTE'
  | 'ARISTA_INEXISTENTE'
  | 'VERTICE_OCUPADO'
  | 'ARISTA_OCUPADA'
  | 'DEMASIADO_CERCA'
  | 'SIN_CONEXION'
  | 'CAMINO_CORTADO'
  | 'CAMINO_NO_ADYACENTE'
  | 'NO_ES_TU_POBLADO'
  | 'SIN_LUGAR_VALIDO';
export interface Rechazo {
  readonly ok: false;
  readonly motivo: MotivoAccion;
  readonly falta?: Costo;
}
export type Decision = { readonly ok: true; readonly eventos: readonly Evento[] } | Rechazo;
export type Resultado =
  { readonly ok: true; readonly estado: Estado; readonly eventos: readonly Evento[] } | Rechazo;
export type ResultadoRegla = { readonly ok: true } | Rechazo;
