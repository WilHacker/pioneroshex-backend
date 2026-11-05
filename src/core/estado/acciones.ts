import type { Costo } from '../reglas/costos.js';
import { decidir } from './decidir.js';
import type { Mesa } from './mesa.js';
import type { Accion, Estado, JugadorId, MotivoAccion, Rechazo } from './tipos.js';

export interface AccionDisponible {
  readonly tipo: Accion['tipo'];
  readonly disponible: boolean;
  readonly motivo?: MotivoAccion;
  readonly falta?: Costo;
}

type Candidatas = (mesa: Mesa, jugador: JugadorId) => Accion[];

const porVertice =
  (tipo: 'COLOCAR_POBLADO_INICIAL' | 'CONSTRUIR_POBLADO' | 'CONSTRUIR_CIUDAD'): Candidatas =>
  (mesa, jugador) =>
    mesa.mapa.vertices.map((v) => ({ tipo, jugador, vertice: v.id }));
const porArista =
  (tipo: 'COLOCAR_CAMINO_INICIAL' | 'CONSTRUIR_CAMINO'): Candidatas =>
  (mesa, jugador) =>
    mesa.mapa.aristas.map((a) => ({ tipo, jugador, arista: a.id }));

/** Candidatas por tipo (cada vértice o arista del mapa); el orden fija el de la respuesta. */
const CANDIDATAS: Record<Accion['tipo'], Candidatas> = {
  COLOCAR_POBLADO_INICIAL: porVertice('COLOCAR_POBLADO_INICIAL'),
  COLOCAR_CAMINO_INICIAL: porArista('COLOCAR_CAMINO_INICIAL'),
  TIRAR_DADOS: (_mesa, jugador) => [{ tipo: 'TIRAR_DADOS', jugador }],
  CONSTRUIR_CAMINO: porArista('CONSTRUIR_CAMINO'),
  CONSTRUIR_POBLADO: porVertice('CONSTRUIR_POBLADO'),
  CONSTRUIR_CIUDAD: porVertice('CONSTRUIR_CIUDAD'),
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
  for (const accion of CANDIDATAS[tipo](mesa, jugador)) {
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
