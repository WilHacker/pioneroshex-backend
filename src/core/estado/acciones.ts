import { clave } from '../mapa/coordenadas.js';
import type { Costo } from '../reglas/costos.js';
import { mejorRazon } from '../reglas/puertos.js';
import { RECURSOS, type Recurso } from '../reglas/recursos.js';
import { puedeColocarCamino } from './conectividad.js';
import { decidir } from './decidir.js';
import type { Mesa } from './mesa.js';
import { victimasPosibles } from './victimas.js';
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

/** Los cambios simples (una razón por una carta): bastan para saber si se puede cambiar algo y a los bots. */
const cambiosConBanca: Candidatas = (mesa, jugador, estado) => {
  const edificios = estado?.edificios ?? {};
  const propios = new Set(Object.keys(edificios).filter((v) => edificios[v]?.dueno === jugador));
  return RECURSOS.flatMap((entrega) =>
    RECURSOS.filter((recibe) => recibe !== entrega).map((recibe) => ({
      tipo: 'CAMBIAR_CON_BANCA' as const,
      jugador,
      entrega: { [entrega]: mejorRazon(mesa.puertos, propios, entrega) },
      recibe: { [recibe]: 1 },
    })),
  );
};

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
    const victimas = victimasPosibles(mesa, estado, jugador, c);
    if (victimas.length === 0)
      return [{ tipo: 'MOVER_LADRON', jugador, destino: c, victima: null }];
    return victimas.map((victima): Accion => ({
      tipo: 'MOVER_LADRON',
      jugador,
      destino: c,
      victima,
    }));
  });
};

const PARES_RECURSOS: readonly (readonly [Recurso, Recurso])[] = RECURSOS.flatMap((r1) =>
  RECURSOS.map((r2) => [r1, r2] as const),
);

const jugarCaballero: Candidatas = (mesa, jugador, estado) => {
  if (!estado) {
    return mesa.mapa.casillas.map((c): Accion => ({
      tipo: 'JUGAR_CABALLERO',
      jugador,
      destino: c,
      victima: null,
    }));
  }
  return mesa.mapa.casillas.flatMap((c): Accion[] => {
    const victimas = victimasPosibles(mesa, estado, jugador, c);
    if (victimas.length === 0)
      return [{ tipo: 'JUGAR_CABALLERO', jugador, destino: c, victima: null }];
    return victimas.map((victima): Accion => ({
      tipo: 'JUGAR_CABALLERO',
      jugador,
      destino: c,
      victima,
    }));
  });
};

const jugarAbundancia: Candidatas = (_mesa, jugador, estado) => {
  if (
    estado &&
    (!estado.jugadores.find((j) => j.id === jugador)?.cartasDesarrollo.includes('ABUNDANCIA') ||
      estado.cartaJugadaEsteTurno)
  ) {
    return [{ tipo: 'JUGAR_ABUNDANCIA', jugador, recursos: ['MADERA', 'TRIGO'] }];
  }
  return PARES_RECURSOS.map((recursos) => ({
    tipo: 'JUGAR_ABUNDANCIA',
    jugador,
    recursos,
  }));
};

const jugarMonopolio: Candidatas = (_mesa, jugador, estado) => {
  if (
    estado &&
    (!estado.jugadores.find((j) => j.id === jugador)?.cartasDesarrollo.includes('MONOPOLIO') ||
      estado.cartaJugadaEsteTurno)
  ) {
    return [{ tipo: 'JUGAR_MONOPOLIO', jugador, recurso: 'TRIGO' }];
  }
  return RECURSOS.map((recurso) => ({
    tipo: 'JUGAR_MONOPOLIO',
    jugador,
    recurso,
  }));
};

const jugarConstruccionCarreteras: Candidatas = (mesa, jugador, estado) => {
  if (!estado) {
    return mesa.mapa.aristas.map((a): Accion => ({
      tipo: 'JUGAR_CONSTRUCCION_CARRETERAS',
      jugador,
      aristas: [a.id],
    }));
  }
  const j = estado.jugadores.find((jug) => jug.id === jugador);
  if (
    !j ||
    !j.cartasDesarrollo.includes('CONSTRUCCION_CARRETERAS') ||
    estado.cartaJugadaEsteTurno ||
    // Igual que el motor: una carta de desarrollo se puede jugar antes de tirar y en la fase principal.
    (estado.fase !== 'FASE_PRINCIPAL' && estado.fase !== 'PRE_TIRADA') ||
    j.piezasRestantes.caminos === 0
  ) {
    return [
      { tipo: 'JUGAR_CONSTRUCCION_CARRETERAS', jugador, aristas: [mesa.mapa.aristas[0]!.id] },
    ];
  }

  const aristasValidas1 = mesa.mapa.aristas
    .filter((a) => !estado.caminos[a.id])
    .filter((a) => puedeColocarCamino(mesa, estado, jugador, a.id).ok)
    .map((a) => a.id);

  const candidatas: Accion[] = [];
  for (const a1 of aristasValidas1) {
    candidatas.push({ tipo: 'JUGAR_CONSTRUCCION_CARRETERAS', jugador, aristas: [a1] });
    if (j.piezasRestantes.caminos >= 2) {
      const estadoConA1: Estado = {
        ...estado,
        caminos: { ...estado.caminos, [a1]: jugador },
      };
      const aristasValidas2 = mesa.mapa.aristas
        .filter((a) => a.id !== a1 && !estadoConA1.caminos[a.id])
        .filter((a) => puedeColocarCamino(mesa, estadoConA1, jugador, a.id).ok)
        .map((a) => a.id);

      for (const a2 of aristasValidas2) {
        candidatas.push({
          tipo: 'JUGAR_CONSTRUCCION_CARRETERAS',
          jugador,
          aristas: [a1, a2],
        });
      }
    }
  }
  return candidatas.length > 0
    ? candidatas
    : [{ tipo: 'JUGAR_CONSTRUCCION_CARRETERAS', jugador, aristas: [mesa.mapa.aristas[0]!.id] }];
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
  PROPONER_TRATO: (_mesa, jugador, estado) => {
    if (estado && jugador !== estado.jugadores[estado.turnoDe]?.id) {
      return [{ tipo: 'PROPONER_TRATO', jugador, entrega: {}, pide: {} }];
    }
    return RECURSOS.flatMap((entrega) =>
      RECURSOS.filter((pide) => pide !== entrega).map((pide) => ({
        tipo: 'PROPONER_TRATO' as const,
        jugador,
        entrega: { [entrega]: 1 },
        pide: { [pide]: 1 },
      })),
    );
  },
  ACEPTAR_TRATO: (_mesa, jugador, estado) =>
    estado?.tratos.length
      ? estado.tratos.map((t) => ({ tipo: 'ACEPTAR_TRATO' as const, jugador, tratoId: t.id }))
      : [{ tipo: 'ACEPTAR_TRATO' as const, jugador, tratoId: '' }],
  CONFIRMAR_TRATO: (_mesa, jugador, estado) => {
    const propios = (estado?.tratos ?? []).filter((t) => t.proponente === jugador);
    const candidatas = propios.flatMap((t) =>
      (t.aceptadoPor ?? []).map((con) => ({
        tipo: 'CONFIRMAR_TRATO' as const,
        jugador,
        tratoId: t.id,
        con,
      })),
    );
    return candidatas.length > 0
      ? candidatas
      : [{ tipo: 'CONFIRMAR_TRATO' as const, jugador, tratoId: '', con: '' }];
  },
  RECHAZAR_TRATO: (_mesa, jugador, estado) =>
    estado?.tratos.length
      ? estado.tratos.map((t) => ({ tipo: 'RECHAZAR_TRATO' as const, jugador, tratoId: t.id }))
      : [{ tipo: 'RECHAZAR_TRATO' as const, jugador, tratoId: '' }],
  CANCELAR_TRATO: (_mesa, jugador, estado) => {
    const propios = (estado?.tratos ?? []).filter((t) => t.proponente === jugador);
    return propios.length
      ? propios.map((t) => ({ tipo: 'CANCELAR_TRATO' as const, jugador, tratoId: t.id }))
      : [{ tipo: 'CANCELAR_TRATO' as const, jugador, tratoId: '' }];
  },
  CONTRAOFERTAR_TRATO: (_mesa, jugador, estado) => {
    const ajenos = (estado?.tratos ?? []).filter((t) => t.proponente !== jugador);
    return ajenos.length
      ? ajenos.map((t) => ({
          tipo: 'CONTRAOFERTAR_TRATO' as const,
          jugador,
          tratoIdOriginal: t.id,
          entrega: { ...t.pide },
          pide: { ...t.entrega },
        }))
      : [
          {
            tipo: 'CONTRAOFERTAR_TRATO' as const,
            jugador,
            tratoIdOriginal: '',
            entrega: {},
            pide: {},
          },
        ];
  },
  COMPRAR_CARTA_DESARROLLO: (_mesa, jugador) => [{ tipo: 'COMPRAR_CARTA_DESARROLLO', jugador }],
  JUGAR_CABALLERO: jugarCaballero,
  JUGAR_CONSTRUCCION_CARRETERAS: jugarConstruccionCarreteras,
  JUGAR_ABUNDANCIA: jugarAbundancia,
  JUGAR_MONOPOLIO: jugarMonopolio,
  PASAR_CONSTRUCCION_ESPECIAL: (_mesa, jugador) => [
    { tipo: 'PASAR_CONSTRUCCION_ESPECIAL', jugador },
  ],
  TERMINAR_TURNO: (_mesa, jugador) => [{ tipo: 'TERMINAR_TURNO', jugador }],
  // No es una jugada que ofrecer: ni la ayuda ni el bot ni el piloto deben elegirla nunca.
  ABANDONAR: () => [],
};
const SIN_AYUDA: ReadonlySet<Accion['tipo']> = new Set(['ABANDONAR']);
const TIPOS = (Object.keys(CANDIDATAS) as Accion['tipo'][]).filter((t) => !SIN_AYUDA.has(t));

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
  CAMBIO_INCORRECTO: 'general',
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
  TRATO_INEXISTENTE: 'general',
  NO_ES_TU_TRATO: 'general',
  DESTINATARIO_INVALIDO: 'general',
  OFERTA_VACIA: 'general',
  PETICION_VACIA: 'general',
  INTERCAMBIO_SOLAPADO: 'general',
  TRATO_NO_DIRIGIDO_A_TI: 'general',
  YA_RECHAZADO: 'general',
  YA_ACEPTADO: 'general',
  NO_PUEDES_COMERCIAR: 'general',
  DEMASIADAS_OFERTAS: 'general',
  MAZO_AGOTADO: 'general',
  NO_TIENES_ESA_CARTA: 'general',
  CARTA_COMPRADA_ESTE_TURNO: 'general',
  YA_JUGASTE_CARTA_ESTE_TURNO: 'general',
  ARISTAS_INVALIDAS: 'lugar',
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
 * Dónde puede actuar el jugador ahora, para que el cliente resalte solo lo válido. Los vértices y
 * aristas son ids del mapa; las casillas son claves `"q,r"`. Es solo ayuda: manda `decidir`.
 */
export interface Sitios {
  readonly poblados: readonly string[];
  readonly ciudades: readonly string[];
  readonly caminos: readonly string[];
  readonly ladron: readonly string[];
  readonly caballero: readonly string[];
  /** Aristas donde puede ir alguno de los caminos de "construcción de carreteras". */
  readonly carreteras: readonly string[];
}

export const SITIOS_VACIOS: Sitios = Object.freeze({
  poblados: [],
  ciudades: [],
  caminos: [],
  ladron: [],
  caballero: [],
  carreteras: [],
});

const unicos = (valores: readonly string[]): string[] => [...new Set(valores)];

function sitiosDe(aceptadas: readonly Accion[]): Sitios {
  const poblados: string[] = [];
  const ciudades: string[] = [];
  const caminos: string[] = [];
  const ladron: string[] = [];
  const caballero: string[] = [];
  const carreteras: string[] = [];
  for (const accion of aceptadas) {
    switch (accion.tipo) {
      case 'COLOCAR_POBLADO_INICIAL':
      case 'CONSTRUIR_POBLADO':
        poblados.push(accion.vertice);
        break;
      case 'CONSTRUIR_CIUDAD':
        ciudades.push(accion.vertice);
        break;
      case 'COLOCAR_CAMINO_INICIAL':
      case 'CONSTRUIR_CAMINO':
        caminos.push(accion.arista);
        break;
      case 'MOVER_LADRON':
        ladron.push(clave(accion.destino));
        break;
      case 'JUGAR_CABALLERO':
        caballero.push(clave(accion.destino));
        break;
      case 'JUGAR_CONSTRUCCION_CARRETERAS':
        carreteras.push(...accion.aristas);
        break;
      default:
        break;
    }
  }
  return {
    poblados: unicos(poblados),
    ciudades: unicos(ciudades),
    caminos: unicos(caminos),
    ladron: unicos(ladron),
    caballero: unicos(caballero),
    carreteras: unicos(carreteras),
  };
}

/**
 * Lo que necesita un cliente para pintar sus botones y resaltar el tablero: una entrada por tipo de
 * acción y los sitios válidos. Si una acción no está disponible: el motivo general que da `decidir`
 * (turno, fase, piezas, recursos con `falta`) o SIN_LUGAR_VALIDO si solo falla la posición.
 */
export function ayuda(
  mesa: Mesa,
  estado: Estado,
  jugador: JugadorId,
): { readonly acciones: readonly AccionDisponible[]; readonly sitios: Sitios } {
  validarJugador(estado, jugador);
  const aceptadas: Accion[] = [];
  const acciones = TIPOS.map((tipo): AccionDisponible => {
    const evaluacion = evaluar(mesa, estado, jugador, tipo);
    aceptadas.push(...evaluacion.aceptadas);
    const { primerRechazo } = evaluacion;
    if (evaluacion.aceptadas.length > 0) return { tipo, disponible: true };
    if (!primerRechazo || ALCANCE[primerRechazo.motivo] === 'lugar') {
      return { tipo, disponible: false, motivo: 'SIN_LUGAR_VALIDO' };
    }
    const { motivo, falta } = primerRechazo;
    return falta
      ? { tipo, disponible: false, motivo, falta: { ...falta } }
      : { tipo, disponible: false, motivo };
  });
  return { acciones, sitios: sitiosDe(aceptadas) };
}

/** Una entrada por tipo de acción (ver `ayuda`). */
export function accionesDisponibles(
  mesa: Mesa,
  estado: Estado,
  jugador: JugadorId,
): readonly AccionDisponible[] {
  return ayuda(mesa, estado, jugador).acciones;
}
