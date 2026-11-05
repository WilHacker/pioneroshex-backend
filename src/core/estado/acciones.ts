import type { Costo } from '../reglas/costos.js';
import { RECURSOS } from '../reglas/recursos.js';
import { decidir } from './decidir.js';
import type { Mesa } from './mesa.js';
import type { Accion, Estado, JugadorId, MotivoAccion, Rechazo } from './tipos.js';

export interface AccionDisponible {
  readonly tipo: Accion['tipo'];
  readonly disponible: boolean;
  readonly motivo?: MotivoAccion;
  readonly falta?: Costo;
}

type Candidatas = (mesa: Mesa, jugador: JugadorId, estado?: Estado) => Accion[];

const porVertice =
  (tipo: 'COLOCAR_POBLADO_INICIAL' | 'CONSTRUIR_POBLADO' | 'CONSTRUIR_CIUDAD'): Candidatas =>
  (mesa, jugador) =>
    mesa.mapa.vertices.map((v) => ({ tipo, jugador, vertice: v.id }));
const porArista =
  (tipo: 'COLOCAR_CAMINO_INICIAL' | 'CONSTRUIR_CAMINO'): Candidatas =>
  (mesa, jugador) =>
    mesa.mapa.aristas.map((a) => ({ tipo, jugador, arista: a.id }));

const cambiosConBanca: Candidatas = (_mesa, jugador) =>
  RECURSOS.flatMap((entrega) =>
    RECURSOS.filter((recibe) => recibe !== entrega).map((recibe) => ({
      tipo: 'CAMBIAR_CON_BANCA' as const,
      jugador,
      entrega,
      recibe,
    })),
  );

const moverLadron: Candidatas = (mesa, jugador, estado) => {
  if (!estado) {
    return mesa.mapa.casillas.map((c): Accion => ({
      tipo: 'MOVER_LADRON',
      jugador,
      destino: c,
      victima: null,
    }));
  }
  return mesa.mapa.casillas.flatMap((c): Accion[] => {
    const cClave = `${c.q},${c.r},${c.s}`;
    const vertices = mesa.mapa.vertices.filter((v) =>
      v.casillas.some((cas) => `${cas.q},${cas.r},${cas.s}` === cClave),
    );
    const rivalesConCartas = Array.from(
      new Set(
        vertices
          .map((v) => estado.edificios[v.id]?.dueno)
          .filter((id): id is JugadorId => Boolean(id && id !== jugador)),
      ),
    ).filter((rId) => {
      const rJug = estado.jugadores.find((j) => j.id === rId);
      return rJug && RECURSOS.some((rec) => rJug.recursos[rec] > 0);
    });

    if (rivalesConCartas.length > 0) {
      return rivalesConCartas.map((victima): Accion => ({
        tipo: 'MOVER_LADRON',
        jugador,
        destino: c,
        victima,
      }));
    }
    return [{ tipo: 'MOVER_LADRON', jugador, destino: c, victima: null }];
  });
};

/** Candidatas por tipo (cada vértice o arista del mapa); el orden fija el de la respuesta. */
const CANDIDATAS: Record<Accion['tipo'], Candidatas> = {
  COLOCAR_POBLADO_INICIAL: porVertice('COLOCAR_POBLADO_INICIAL'),
  COLOCAR_CAMINO_INICIAL: porArista('COLOCAR_CAMINO_INICIAL'),
  TIRAR_DADOS: (_mesa, jugador) => [{ tipo: 'TIRAR_DADOS', jugador }],
  DESCARTAR_RECURSOS: (_mesa, jugador) => [{ tipo: 'DESCARTAR_RECURSOS', jugador, recursos: {} }],
  DESCARTE_AUTOMATICO: (_mesa, jugador) => [{ tipo: 'DESCARTE_AUTOMATICO', jugador }],
  MOVER_LADRON: moverLadron,
  SALTAR_TURNO_POR_INACTIVIDAD: (_mesa, jugador) => [
    { tipo: 'SALTAR_TURNO_POR_INACTIVIDAD', jugador },
  ],
  CONSTRUIR_CAMINO: porArista('CONSTRUIR_CAMINO'),
  CONSTRUIR_POBLADO: porVertice('CONSTRUIR_POBLADO'),
  CONSTRUIR_CIUDAD: porVertice('CONSTRUIR_CIUDAD'),
  CAMBIAR_CON_BANCA: cambiosConBanca,
  TERMINAR_TURNO: (_mesa, jugador) => [{ tipo: 'TERMINAR_TURNO', jugador }],
};
const TIPOS = Object.keys(CANDIDATAS) as Accion['tipo'][];

/**
 * 'general': `decidir` lo comprueba antes de mirar la posición, así que vale para el tipo entero.
 * 'lugar': depende del vértice o la arista. El `Record` obliga a clasificar cada motivo nuevo.
 * JUGADOR_DESCONOCIDO no llega aquí (se lanza antes), pero se clasifica igual.
 */
const ALCANCE: Readonly<Record<MotivoAccion, 'general' | 'lugar'>> = {
  PARTIDA_TERMINADA: 'general',
  JUGADOR_DESCONOCIDO: 'general',
  NO_ES_TU_TURNO: 'general',
  FASE_INCORRECTA: 'general',
  SIN_PIEZAS: 'general',
  RECURSOS_INSUFICIENTES: 'general',
  NO_DEBES_DESCARTAR: 'general',
  CANTIDAD_DESCARTE_INCORRECTA: 'general',
  BANCO_AGOTADO: 'general',
  MISMO_RECURSO: 'general',
  RECURSO_INVALIDO: 'general',
  DESTINO_INVALIDO: 'lugar',
  MISMO_DESTINO: 'lugar',
  VICTIMA_INVALIDA: 'lugar',
  VICTIMA_REQUERIDA: 'lugar',
  SIN_VICTIMA_POSIBLE: 'lugar',
  VERTICE_INEXISTENTE: 'lugar',
  ARISTA_INEXISTENTE: 'lugar',
  VERTICE_OCUPADO: 'lugar',
  ARISTA_OCUPADA: 'lugar',
  DEMASIADO_CERCA: 'lugar',
  SIN_CONEXION: 'lugar',
  CAMINO_CORTADO: 'lugar',
  CAMINO_NO_ADYACENTE: 'lugar',
  NO_ES_TU_POBLADO: 'lugar',
  SIN_LUGAR_VALIDO: 'lugar',
};

interface Evaluacion {
  readonly aceptadas: Accion[];
  readonly primerRechazo: Rechazo | null;
}

// ponytail: un `decidir` por vértice/arista y tipo (~2 ms por llamada en radio 3 con 10
// jugadores, medido); si la ayuda se pide en cada frame, cortar en el primer rechazo general.
function evaluar(mesa: Mesa, estado: Estado, jugador: JugadorId, tipo: Accion['tipo']): Evaluacion {
  const aceptadas: Accion[] = [];
  let primerRechazo: Rechazo | null = null;
  for (const accion of CANDIDATAS[tipo](mesa, jugador, estado)) {
    const decision = decidir(mesa, estado, accion);
    if (decision.ok) aceptadas.push(accion);
    else primerRechazo ??= decision;
  }
  return { aceptadas, primerRechazo };
}

function validarJugador(estado: Estado, jugador: JugadorId): void {
  if (!estado.jugadores.some((j) => j.id === jugador)) {
    throw new Error(`El jugador "${jugador}" no participa en la partida`);
  }
}

/** Todas las acciones concretas que `decidir` acepta ahora para `jugador` (objetos nuevos). */
export function enumerarAcciones(
  mesa: Mesa,
  estado: Estado,
  jugador: JugadorId,
): readonly Accion[] {
  validarJugador(estado, jugador);
  return TIPOS.flatMap((tipo) => evaluar(mesa, estado, jugador, tipo).aceptadas);
}

/**
 * Una entrada por tipo de acción. Si no está disponible: el motivo general que da `decidir`
 * (turno, fase, piezas, recursos con `falta`) o SIN_LUGAR_VALIDO si solo falla la posición.
 */
export function accionesDisponibles(
  mesa: Mesa,
  estado: Estado,
  jugador: JugadorId,
): readonly AccionDisponible[] {
  validarJugador(estado, jugador);
  return TIPOS.map((tipo): AccionDisponible => {
    const { aceptadas, primerRechazo } = evaluar(mesa, estado, jugador, tipo);
    if (aceptadas.length > 0) return { tipo, disponible: true };
    if (!primerRechazo || ALCANCE[primerRechazo.motivo] === 'lugar') {
      return { tipo, disponible: false, motivo: 'SIN_LUGAR_VALIDO' };
    }
    const { motivo, falta } = primerRechazo;
    return falta
      ? { tipo, disponible: false, motivo, falta: { ...falta } }
      : { tipo, disponible: false, motivo };
  });
}
