import type { TiradaDeSorteo } from '../reglas/orden.js';
import type { Hex } from '../mapa/coordenadas.js';
import type { GameConfig } from '../partida/game-config.js';
import type { Costo, LimitesDePiezas } from '../reglas/costos.js';
import type { CartaDesarrollo } from '../reglas/mazo.js';
import type { Recurso } from '../reglas/recursos.js';

export type JugadorId = string;
export type Fase =
  | 'PREPARACION_POBLADO'
  | 'PREPARACION_CAMINO'
  | 'PRE_TIRADA'
  | 'DESCARTE'
  | 'MOVER_LADRON'
  | 'FASE_PRINCIPAL'
  | 'CONSTRUCCION_ESPECIAL'
  | 'FIN';
export type TipoEdificio = 'POBLADO' | 'CIUDAD';
export interface Edificio {
  readonly dueno: JugadorId;
  readonly tipo: TipoEdificio;
}
export interface Trato {
  readonly id: string;
  readonly proponente: JugadorId;
  readonly destinatario: JugadorId | null; // null = abierto a cualquier rival
  readonly entrega: Readonly<Record<Recurso, number>>;
  readonly pide: Readonly<Record<Recurso, number>>;
  readonly rechazadoPor: readonly JugadorId[];
  readonly contraofertaDe?: string;
}
export interface Jugador {
  readonly id: JugadorId;
  readonly recursos: Readonly<Record<Recurso, number>>;
  readonly piezasRestantes: LimitesDePiezas;
  readonly cartasDesarrollo: readonly CartaDesarrollo[];
  readonly cartasCompradasEsteTurno: readonly CartaDesarrollo[];
  readonly caballerosJugados: number;
}
export interface Estado {
  readonly config: GameConfig;
  readonly jugadores: readonly Jugador[]; // en orden de turno
  readonly fase: Fase;
  readonly turnoDe: number; // índice en jugadores
  readonly pasoPreparacion: number; // 0..2n-1 en preparación; 2n después
  readonly pobladoPendiente: string | null; // vértice del poblado inicial sin camino
  readonly descartesPendientes: Readonly<Record<JugadorId, number>>;
  readonly tratos: readonly Trato[];
  readonly turnoEspecialDe: number | null; // índice durante CONSTRUCCION_ESPECIAL
  readonly edificios: Readonly<Record<string, Edificio>>; // por id de vértice
  readonly caminos: Readonly<Record<string, JugadorId>>; // por id de arista
  readonly banco: Readonly<Record<Recurso, number>>;
  readonly mazo: readonly CartaDesarrollo[];
  readonly granEjercito: JugadorId | null;
  readonly granRuta: JugadorId | null;
  readonly longitudGranRuta: number;
  readonly cartaJugadaEsteTurno: boolean;
  readonly ladron: Hex | null;
  readonly dados: readonly [number, number] | null;
  readonly tiradas: number;
  readonly version: number;
  readonly ganador: JugadorId | null;
  /** Quienes dejaron la partida a propósito: el servidor juega por ellos hasta el final. */
  readonly abandonados: readonly JugadorId[];
  /** El sorteo del orden de turno por dados (vacío si el orden no se sorteó). Es público. */
  readonly sorteo: readonly (readonly TiradaDeSorteo[])[];
  /** Ofertas que ha propuesto quien tiene el turno en este turno (para el tope por turno). */
  readonly ofertasEsteTurno: number;
}
export type Accion =
  | { tipo: 'COLOCAR_POBLADO_INICIAL'; jugador: JugadorId; vertice: string }
  | { tipo: 'COLOCAR_CAMINO_INICIAL'; jugador: JugadorId; arista: string }
  | { tipo: 'TIRAR_DADOS'; jugador: JugadorId }
  | { tipo: 'DESCARTAR_RECURSOS'; jugador: JugadorId; recursos: Partial<Record<Recurso, number>> }
  | { tipo: 'DESCARTE_AUTOMATICO'; jugador: JugadorId }
  | { tipo: 'MOVER_LADRON'; jugador: JugadorId; destino: Hex; victima: JugadorId | null }
  | { tipo: 'SALTAR_TURNO_POR_INACTIVIDAD'; jugador: JugadorId }
  | { tipo: 'CONSTRUIR_CAMINO'; jugador: JugadorId; arista: string }
  | { tipo: 'CONSTRUIR_POBLADO'; jugador: JugadorId; vertice: string }
  | { tipo: 'CONSTRUIR_CIUDAD'; jugador: JugadorId; vertice: string }
  | { tipo: 'CAMBIAR_CON_BANCA'; jugador: JugadorId; entrega: Recurso; recibe: Recurso }
  | {
      tipo: 'PROPONER_TRATO';
      jugador: JugadorId;
      entrega: Partial<Record<Recurso, number>>;
      pide: Partial<Record<Recurso, number>>;
      destinatario?: JugadorId | null;
    }
  | { tipo: 'ACEPTAR_TRATO'; jugador: JugadorId; tratoId: string }
  | { tipo: 'RECHAZAR_TRATO'; jugador: JugadorId; tratoId: string }
  | { tipo: 'CANCELAR_TRATO'; jugador: JugadorId; tratoId: string }
  | {
      tipo: 'CONTRAOFERTAR_TRATO';
      jugador: JugadorId;
      tratoIdOriginal: string;
      entrega: Partial<Record<Recurso, number>>;
      pide: Partial<Record<Recurso, number>>;
    }
  | { tipo: 'PASAR_CONSTRUCCION_ESPECIAL'; jugador: JugadorId }
  | { tipo: 'COMPRAR_CARTA_DESARROLLO'; jugador: JugadorId }
  | { tipo: 'JUGAR_CABALLERO'; jugador: JugadorId; destino: Hex; victima: JugadorId | null }
  | {
      tipo: 'JUGAR_CONSTRUCCION_CARRETERAS';
      jugador: JugadorId;
      aristas: readonly [string] | readonly [string, string];
    }
  | { tipo: 'JUGAR_ABUNDANCIA'; jugador: JugadorId; recursos: readonly [Recurso, Recurso] }
  | { tipo: 'JUGAR_MONOPOLIO'; jugador: JugadorId; recurso: Recurso }
  | { tipo: 'TERMINAR_TURNO'; jugador: JugadorId }
  /** Dejar la partida. Vale en cualquier momento, también fuera de turno. */
  | { tipo: 'ABANDONAR'; jugador: JugadorId };
export type Origen = 'PREPARACION' | 'CONSTRUCCION';
/** Quién provocó la acción: el jugador (VOLUNTARIA) o el reloj de inactividad (INACTIVIDAD). */
export type CausaAccion = 'VOLUNTARIA' | 'INACTIVIDAD';
/** Puntos de victoria por categoría (no cantidades). `total` es la suma de todas. */
export interface DesglosePuntos {
  readonly poblados: number;
  readonly ciudades: number;
  readonly granEjercito: number;
  readonly granRuta: number;
  readonly cartasPuntoVictoria: number;
  readonly total: number;
}
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
  | {
      tipo: 'DADOS_TIRADOS';
      jugador: JugadorId;
      dados: readonly [number, number];
      causa: CausaAccion;
    }
  | { tipo: 'DESCARTE_REQUERIDO'; jugador: JugadorId; cantidad: number }
  | {
      tipo: 'RECURSOS_DESCARTADOS';
      jugador: JugadorId;
      recursos: Partial<Record<Recurso, number>>;
      causa: CausaAccion;
    }
  | { tipo: 'LADRON_MOVIDO'; jugador: JugadorId; destino: Hex; causa: CausaAccion }
  | { tipo: 'CARTA_ROBADA'; ladron: JugadorId; victima: JugadorId; recurso: Recurso | null }
  | {
      tipo: 'RECURSOS_REPARTIDOS';
      jugador: JugadorId;
      recurso: Recurso;
      cantidad: number;
      pedido: number;
      recortado: number;
      causa: CausaRecursos;
    }
  | {
      tipo: 'CAMBIO_CON_BANCA_REALIZADO';
      jugador: JugadorId;
      entrega: Recurso;
      cantidadEntregada: number;
      recibe: Recurso;
      cantidadRecibida: 1;
    }
  | {
      tipo: 'PRODUCCION_BLOQUEADA';
      recurso: Recurso;
      pedido: number;
      /** Lo que quedaba en el banco; `null` para quien no puede verlo (regla «ocultar banco»). */
      disponible: number | null;
    }
  | { tipo: 'TRATO_PROPUESTO'; trato: Trato }
  | {
      tipo: 'TRATO_ACEPTADO';
      tratoId: string;
      proponente: JugadorId;
      aceptante: JugadorId;
      entrega: Readonly<Record<Recurso, number>>;
      pide: Readonly<Record<Recurso, number>>;
    }
  | { tipo: 'TRATO_RECHAZADO'; tratoId: string; jugador: JugadorId }
  | {
      tipo: 'TRATO_CANCELADO';
      tratoId: string;
      motivo: 'MANUAL' | 'RECURSOS_INSUFICIENTES' | 'FIN_DE_TURNO';
    }
  | {
      tipo: 'FASE_ESPECIAL_INICIADA';
      turnoOriginal: number;
      primerConstructor: number;
    }
  | {
      tipo: 'CONSTRUCCION_ESPECIAL_PASADA';
      jugador: JugadorId;
      siguienteConstructor: number | null;
      causa: CausaAccion;
    }
  | {
      tipo: 'CARTA_DESARROLLO_COMPRADA';
      jugador: JugadorId;
      carta: CartaDesarrollo | null;
      costo: Costo;
    }
  | {
      tipo: 'CABALLERO_JUGADO';
      jugador: JugadorId;
      destino: Hex;
      victima: JugadorId | null;
      recursoRobado: Recurso | null;
    }
  | {
      tipo: 'CONSTRUCCION_CARRETERAS_JUGADA';
      jugador: JugadorId;
      aristas: readonly string[];
    }
  | {
      tipo: 'ABUNDANCIA_JUGADA';
      jugador: JugadorId;
      recursos: readonly [Recurso, Recurso];
    }
  | {
      tipo: 'MONOPOLIO_JUGADO';
      jugador: JugadorId;
      recurso: Recurso;
      cantidadRobada: number;
    }
  | {
      tipo: 'GRAN_EJERCITO_CAMBIADO';
      titularAnterior: JugadorId | null;
      nuevoTitular: JugadorId;
      caballeros: number;
    }
  | {
      tipo: 'GRAN_RUTA_CAMBIADA';
      titularAnterior: JugadorId | null;
      nuevoTitular: JugadorId | null;
      longitud: number;
    }
  | { tipo: 'FASE_CAMBIADA'; fase: Fase; turnoDe: number; pasoPreparacion: number }
  | { tipo: 'TURNO_TERMINADO'; jugador: JugadorId; siguiente: number; causa: CausaAccion }
  | {
      tipo: 'PARTIDA_GANADA';
      jugador: JugadorId;
      puntos: number;
      /** Lo rellena `aplicar` con el estado final; `decidir` solo trae el total. */
      desglose?: DesglosePuntos;
      /** Ganó porque todos los demás abandonaron, sin llegar a los puntos de victoria. */
      porAbandono?: boolean;
    }
  | { tipo: 'JUGADOR_ABANDONO'; jugador: JugadorId };
export type MotivoAccion =
  | 'PARTIDA_TERMINADA'
  | 'JUGADOR_DESCONOCIDO'
  | 'NO_ES_TU_TURNO'
  | 'FASE_INCORRECTA'
  | 'SIN_PIEZAS'
  | 'RECURSOS_INSUFICIENTES'
  | 'NO_DEBES_DESCARTAR'
  | 'CANTIDAD_DESCARTE_INCORRECTA'
  | 'DESTINO_INVALIDO'
  | 'MISMO_DESTINO'
  | 'VICTIMA_INVALIDA'
  | 'VICTIMA_REQUERIDA'
  | 'SIN_VICTIMA_POSIBLE'
  | 'BANCO_AGOTADO'
  | 'MISMO_RECURSO'
  | 'RECURSO_INVALIDO'
  | 'VERTICE_INEXISTENTE'
  | 'ARISTA_INEXISTENTE'
  | 'VERTICE_OCUPADO'
  | 'ARISTA_OCUPADA'
  | 'DEMASIADO_CERCA'
  | 'SIN_CONEXION'
  | 'CAMINO_CORTADO'
  | 'CAMINO_NO_ADYACENTE'
  | 'NO_ES_TU_POBLADO'
  | 'SIN_LUGAR_VALIDO'
  | 'TRATO_INEXISTENTE'
  | 'NO_ES_TU_TRATO'
  | 'DESTINATARIO_INVALIDO'
  | 'OFERTA_VACIA'
  | 'PETICION_VACIA'
  | 'INTERCAMBIO_SOLAPADO'
  | 'TRATO_NO_DIRIGIDO_A_TI'
  | 'YA_RECHAZADO'
  | 'NO_PUEDES_COMERCIAR'
  | 'DEMASIADAS_OFERTAS'
  | 'MAZO_AGOTADO'
  | 'NO_TIENES_ESA_CARTA'
  | 'CARTA_COMPRADA_ESTE_TURNO'
  | 'YA_JUGASTE_CARTA_ESTE_TURNO'
  | 'ARISTAS_INVALIDAS';
/** Datos que explican un rechazo; todos opcionales, cada motivo rellena los suyos. */
export interface DetalleRechazo {
  /** Vecino con poblado o ciudad que impide construir (DEMASIADO_CERCA). */
  readonly vecinoOcupado?: string;
  /** Vértice con edificio rival que corta el camino (CAMINO_CORTADO). */
  readonly verticeCortado?: string;
  /** Jugador que ocupa el vértice, la arista o el edificio que estorba. */
  readonly dueno?: JugadorId;
  /** Poblado inicial al que debe pegarse el camino (CAMINO_NO_ADYACENTE). */
  readonly pobladoPendiente?: string;
  /** Recurso del banco que no alcanza (BANCO_AGOTADO), con lo pedido y lo que queda. */
  readonly recurso?: Recurso;
  readonly pedido?: number;
  readonly disponible?: number;
  /** Cartas que había que descartar y cuántas se entregaron (CANTIDAD_DESCARTE_INCORRECTA). */
  readonly requerido?: number;
  readonly entregado?: number;
  /** Rivales con edificio junto a la casilla y cartas en mano: a quién se puede robar. */
  readonly victimasPosibles?: readonly JugadorId[];
  /** Casilla donde ya está el ladrón (MISMO_DESTINO). */
  readonly ladronEn?: Hex;
  /** Caminos que se podían poner y cuántos se pidieron (ARISTAS_INVALIDAS). */
  readonly maximo?: number;
  readonly pedidas?: number;
}
export interface Rechazo {
  readonly ok: false;
  readonly motivo: MotivoAccion;
  readonly falta?: Costo;
  readonly detalle?: DetalleRechazo;
}
export type Decision = { readonly ok: true; readonly eventos: readonly Evento[] } | Rechazo;
export type Resultado =
  { readonly ok: true; readonly estado: Estado; readonly eventos: readonly Evento[] } | Rechazo;
export type ResultadoRegla = { readonly ok: true } | Rechazo;
