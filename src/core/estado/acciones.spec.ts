import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { LimitesDePiezas } from '../reglas/costos.js';
import { RECURSOS, type Recurso } from '../reglas/recursos.js';
import { accionesDisponibles, enumerarAcciones } from './acciones.js';
import { aplicar } from './aplicar.js';
import { crearPartida } from './crear.js';
import { crearMesa, type Mesa } from './mesa.js';
import { aristaEntre, configDePrueba, conCambios, mesaDePrueba } from './pruebas.js';
import type { Accion, Estado, Fase, JugadorId } from './tipos.js';

const TIPOS: readonly Accion['tipo'][] = [
  'COLOCAR_POBLADO_INICIAL',
  'COLOCAR_CAMINO_INICIAL',
  'TIRAR_DADOS',
  'DESCARTAR_RECURSOS',
  'DESCARTE_AUTOMATICO',
  'MOVER_LADRON',
  'SALTAR_TURNO_POR_INACTIVIDAD',
  'CONSTRUIR_CAMINO',
  'CONSTRUIR_POBLADO',
  'CONSTRUIR_CIUDAD',
  'CAMBIAR_CON_BANCA',
  'PROPONER_TRATO',
  'ACEPTAR_TRATO',
  'CONFIRMAR_TRATO',
  'RECHAZAR_TRATO',
  'CANCELAR_TRATO',
  'CONTRAOFERTAR_TRATO',
  'COMPRAR_CARTA_DESARROLLO',
  'JUGAR_CABALLERO',
  'JUGAR_CONSTRUCCION_CARRETERAS',
  'JUGAR_ABUNDANCIA',
  'JUGAR_MONOPOLIO',
  'PASAR_CONSTRUCCION_ESPECIAL',
  'TERMINAR_TURNO',
];
const SOBRADO: Record<Recurso, number> = { MADERA: 9, LADRILLO: 9, OVEJA: 9, TRIGO: 9, MINERAL: 9 };
const VACIO: Record<Recurso, number> = { MADERA: 0, LADRILLO: 0, OVEJA: 0, TRIGO: 0, MINERAL: 0 };

const enTurno = (e: Estado): JugadorId => e.jugadores[e.turnoDe]!.id;
const claveDe = (a: Accion): string => JSON.stringify(a);

/** Todas las acciones imaginables de un jugador, construidas aquí sin pasar por el código probado. */
function todasLasCandidatas(mesa: Mesa, jugador: JugadorId): Accion[] {
  const vertices = mesa.mapa.vertices.map((v) => v.id);
  const aristas = mesa.mapa.aristas.map((a) => a.id);
  return [
    ...vertices.map((vertice): Accion => ({ tipo: 'COLOCAR_POBLADO_INICIAL', jugador, vertice })),
    ...aristas.map((arista): Accion => ({ tipo: 'COLOCAR_CAMINO_INICIAL', jugador, arista })),
    { tipo: 'TIRAR_DADOS', jugador },
    { tipo: 'DESCARTAR_RECURSOS', jugador, recursos: {} },
    { tipo: 'DESCARTE_AUTOMATICO', jugador },
    ...mesa.mapa.casillas.flatMap((c): Accion[] => [
      { tipo: 'MOVER_LADRON', jugador, destino: c, victima: null },
      ...Array.from({ length: mesa.config.jugadores }, (_, i) => `j${i}`)
        .filter((id) => id !== jugador)
        .map((victima): Accion => ({ tipo: 'MOVER_LADRON', jugador, destino: c, victima })),
    ]),
    { tipo: 'SALTAR_TURNO_POR_INACTIVIDAD', jugador },
    ...aristas.map((arista): Accion => ({ tipo: 'CONSTRUIR_CAMINO', jugador, arista })),
    ...vertices.map((vertice): Accion => ({ tipo: 'CONSTRUIR_POBLADO', jugador, vertice })),
    ...vertices.map((vertice): Accion => ({ tipo: 'CONSTRUIR_CIUDAD', jugador, vertice })),
    // Un cambio simple a cada razón posible (2, 3 y 4): `decidir` solo acepta la que le toca al jugador.
    ...RECURSOS.flatMap((entrega) =>
      RECURSOS.filter((recibe) => recibe !== entrega).flatMap((recibe) =>
        [2, 3, 4].map((razon): Accion => ({
          tipo: 'CAMBIAR_CON_BANCA',
          jugador,
          entrega: { [entrega]: razon },
          recibe: { [recibe]: 1 },
        })),
      ),
    ),
    ...RECURSOS.flatMap((entrega) =>
      RECURSOS.filter((pide) => pide !== entrega).map((pide): Accion => ({
        tipo: 'PROPONER_TRATO',
        jugador,
        entrega: { [entrega]: 1 },
        pide: { [pide]: 1 },
      })),
    ),
    { tipo: 'ACEPTAR_TRATO', jugador, tratoId: 't1' },
    { tipo: 'CONFIRMAR_TRATO', jugador, tratoId: 't1', con: 'j1' },
    { tipo: 'RECHAZAR_TRATO', jugador, tratoId: 't1' },
    { tipo: 'CANCELAR_TRATO', jugador, tratoId: 't1' },
    {
      tipo: 'CONTRAOFERTAR_TRATO',
      jugador,
      tratoIdOriginal: 't1',
      entrega: { OVEJA: 1 },
      pide: { MADERA: 1 },
    },
    { tipo: 'COMPRAR_CARTA_DESARROLLO', jugador },
    ...mesa.mapa.casillas.flatMap((c): Accion[] => [
      { tipo: 'JUGAR_CABALLERO', jugador, destino: c, victima: null },
      ...Array.from({ length: mesa.config.jugadores }, (_, i) => `j${i}`)
        .filter((id) => id !== jugador)
        .map((victima): Accion => ({ tipo: 'JUGAR_CABALLERO', jugador, destino: c, victima })),
    ]),
    ...aristas.map((arista): Accion => ({
      tipo: 'JUGAR_CONSTRUCCION_CARRETERAS',
      jugador,
      aristas: [arista],
    })),
    ...RECURSOS.flatMap((r1) =>
      RECURSOS.map((r2): Accion => ({
        tipo: 'JUGAR_ABUNDANCIA',
        jugador,
        recursos: [r1, r2],
      })),
    ),
    ...RECURSOS.map((recurso): Accion => ({ tipo: 'JUGAR_MONOPOLIO', jugador, recurso })),
    { tipo: 'PASAR_CONSTRUCCION_ESPECIAL', jugador },
    { tipo: 'TERMINAR_TURNO', jugador },
  ];
}

/**
 * Comprueba en `estado`, para cada jugador: lo enumerado lo acepta `aplicar`; todo lo demás se
 * rechaza sin tocar el estado; y `accionesDisponibles` es coherente con la enumeración.
 */
function comprobarEstado(mesa: Mesa, estado: Estado): readonly Accion[] {
  const foto = structuredClone(estado);
  const delTurno = enumerarAcciones(mesa, estado, enTurno(estado));
  // Discrimina: ni vacío ni «todo» (hay candidatas legales e ilegales).
  if (estado.fase !== 'DESCARTE' || estado.descartesPendientes[enTurno(estado)]) {
    expect(delTurno.length).toBeGreaterThan(0);
  }
  expect(delTurno.length).toBeLessThan(todasLasCandidatas(mesa, enTurno(estado)).length);

  for (const { id } of estado.jugadores) {
    const enumeradas = enumerarAcciones(mesa, estado, id);
    const claves = new Set(enumeradas.map(claveDe));
    expect(claves.size).toBe(enumeradas.length);
    // Del jugador en turno, todas las candidatas; de los demás, la primera de cada tipo.
    const candidatas = todasLasCandidatas(mesa, id).filter(
      (a, i, todas) => id === enTurno(estado) || todas.findIndex((b) => b.tipo === a.tipo) === i,
    );
    // Se acumulan los desacuerdos y se comprueban de una vez (un `expect` por acción es lento).
    const desacuerdos = candidatas
      .filter((a) => aplicar(mesa, estado, a).ok !== claves.has(claveDe(a)))
      .map(claveDe);
    expect(desacuerdos).toEqual([]);
    const fueraDeTurnoSinAccion =
      estado.fase !== 'DESCARTE' &&
      estado.fase !== 'CONSTRUCCION_ESPECIAL' &&
      estado.tratos.length === 0 &&
      id !== enTurno(estado);
    if (fueraDeTurnoSinAccion) expect(enumeradas).toEqual([]);
    const disponibles = accionesDisponibles(mesa, estado, id);
    expect(disponibles.map((d) => d.tipo)).toEqual(TIPOS);
    for (const d of disponibles) {
      expect(d.disponible).toBe(enumeradas.some((a) => a.tipo === d.tipo));
      if (fueraDeTurnoSinAccion) {
        expect(d.motivo).toBe('NO_ES_TU_TURNO');
      }
    }
  }
  expect(estado).toEqual(foto);
  return delTurno.length > 0
    ? delTurno
    : estado.jugadores.flatMap((j) => enumerarAcciones(mesa, estado, j.id));
}

const conRecursos = (estado: Estado, recursos: Record<Recurso, number>): Estado =>
  conCambios(estado, {
    jugadores: estado.jugadores.map((j) => ({ ...j, recursos: { ...recursos } })),
  });

describe('enumerarAcciones: propiedad sobre varias semillas', () => {
  it('cada acción enumerada se acepta y cada candidata no enumerada se rechaza sin cambiar el estado', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Za-z0-9]{1,8}$/),
        fc.integer({ min: 2, max: 3 }),
        fc.array(fc.nat(), { minLength: 14, maxLength: 14 }),
        (semilla, jugadores, elecciones) => {
          const mesa = crearMesa(configDePrueba({ semilla, jugadores }));
          const ids = Array.from({ length: jugadores }, (_, i) => `j${i}`);
          let estado = crearPartida(mesa, ids);
          const fases = new Set<Fase>();
          const tipos = new Set<Accion['tipo']>();
          const pasos = 4 * jugadores + elecciones.length;
          for (let paso = 0; paso < pasos; paso++) {
            // Tras la preparación, recursos de sobra para que haya construcciones posibles.
            if (paso === 4 * jugadores) estado = conRecursos(estado, SOBRADO);
            fases.add(estado.fase);
            const acciones = comprobarEstado(mesa, estado);
            acciones.forEach((a) => tipos.add(a.tipo));
            const eleccion = elecciones[paso - 4 * jugadores] ?? paso;
            const r = aplicar(mesa, estado, acciones[eleccion % acciones.length]!);
            if (!r.ok) throw new Error(r.motivo);
            estado = r.estado;
          }
          expect([...fases]).toEqual(
            expect.arrayContaining([
              'PREPARACION_POBLADO',
              'PREPARACION_CAMINO',
              'PRE_TIRADA',
              'FASE_PRINCIPAL',
            ]),
          );
          expect([...tipos]).toEqual(
            expect.arrayContaining([
              'COLOCAR_POBLADO_INICIAL',
              'COLOCAR_CAMINO_INICIAL',
              'TIRAR_DADOS',
              'CONSTRUIR_CAMINO',
              'CONSTRUIR_CIUDAD',
              'TERMINAR_TURNO',
            ]),
          );
        },
      ),
      { numRuns: 8 },
    );
  }, 60_000); // recorre cientos de estados; margen para CI lenta y cobertura
});

// Estado fijo en FASE_PRINCIPAL: j0 con poblado en `centro` y camino centro-n0.
const mesa = mesaDePrueba();
const inicial = crearPartida(mesa, ['a', 'b', 'c', 'd']);
const [j0, j1] = inicial.jugadores.map((j) => j.id) as [string, string];
const centro = mesa.mapa.vertices.find((v) => v.vecinos.length === 3)!;
const n0 = centro.vecinos[0]!;
const aristaCentroN0 = aristaEntre(mesa, centro.id, n0);
const principal = conCambios(inicial, {
  fase: 'FASE_PRINCIPAL',
  pasoPreparacion: 8,
  edificios: { [centro.id]: { dueno: j0, tipo: 'POBLADO' } },
  caminos: { [aristaCentroN0]: j0 },
});

function conJ0(
  estado: Estado,
  recursos: Partial<Record<Recurso, number>>,
  piezas: Partial<LimitesDePiezas> = {},
): Estado {
  const jugadores = estado.jugadores.map((j) =>
    j.id === j0
      ? {
          ...j,
          recursos: { ...j.recursos, ...recursos },
          piezasRestantes: { ...j.piezasRestantes, ...piezas },
        }
      : j,
  );
  return conCambios(estado, { jugadores });
}
const entrada = (estado: Estado, tipo: Accion['tipo'], jugador = j0) =>
  accionesDisponibles(mesa, estado, jugador).find((d) => d.tipo === tipo);

describe('construcción de carreteras antes de tirar los dados', () => {
  // El motor deja jugar una carta de desarrollo antes de tirar: la enumeración (que usan la ayuda del
  // cliente y el piloto) debe ofrecerla también en esa fase. Antes solo la ofrecía en FASE_PRINCIPAL.
  const conLaCarta = (fase: Fase): Estado =>
    conCambios(principal, {
      fase,
      jugadores: principal.jugadores.map((j) =>
        j.id === j0 ? { ...j, cartasDesarrollo: ['CONSTRUCCION_CARRETERAS' as const] } : j,
      ),
    });

  it.each(['PRE_TIRADA', 'FASE_PRINCIPAL'] as const)(
    'en %s se enumeran los caminos que se pueden poner y el motor los acepta',
    (fase) => {
      const estado = conLaCarta(fase);
      const ofrecidas = enumerarAcciones(mesa, estado, j0).filter(
        (a) => a.tipo === 'JUGAR_CONSTRUCCION_CARRETERAS',
      );
      expect(ofrecidas.length).toBeGreaterThan(0);
      for (const accion of ofrecidas) expect(aplicar(mesa, estado, accion).ok).toBe(true);
      expect(entrada(estado, 'JUGAR_CONSTRUCCION_CARRETERAS')).toEqual({
        tipo: 'JUGAR_CONSTRUCCION_CARRETERAS',
        disponible: true,
      });
    },
  );

  it('todo camino que el motor acepta con esa carta está enumerado (ni uno de más ni de menos)', () => {
    const estado = conLaCarta('PRE_TIRADA');
    const enumeradas = new Set(
      enumerarAcciones(mesa, estado, j0)
        .filter((a) => a.tipo === 'JUGAR_CONSTRUCCION_CARRETERAS')
        .map(claveDe),
    );
    const aceptadas = mesa.mapa.aristas
      .map((a): Accion => ({
        tipo: 'JUGAR_CONSTRUCCION_CARRETERAS',
        jugador: j0,
        aristas: [a.id],
      }))
      .filter((a) => aplicar(mesa, estado, a).ok);
    expect(new Set(aceptadas.map(claveDe))).toEqual(
      new Set(
        [...enumeradas].filter(
          (c) => (JSON.parse(c) as { aristas: string[] }).aristas.length === 1,
        ),
      ),
    );
  });

  it('sin la carta, o con otra fase, no se ofrece', () => {
    expect(
      entrada(conLaCarta('FASE_PRINCIPAL'), 'JUGAR_CONSTRUCCION_CARRETERAS', j1)?.disponible,
    ).toBe(false);
    expect(entrada(conLaCarta('DESCARTE'), 'JUGAR_CONSTRUCCION_CARRETERAS')?.disponible).toBe(
      false,
    );
  });
});

describe('accionesDisponibles: ayuda por tipo', () => {
  it('sin recursos: CONSTRUIR_CIUDAD con RECURSOS_INSUFICIENTES y la falta exacta', () => {
    const sinNada = conJ0(principal, VACIO);
    expect(entrada(sinNada, 'CONSTRUIR_CIUDAD')).toEqual({
      tipo: 'CONSTRUIR_CIUDAD',
      disponible: false,
      motivo: 'RECURSOS_INSUFICIENTES',
      falta: { TRIGO: 2, MINERAL: 3 },
    });
  });

  it('«te falta 1 trigo para una ciudad»', () => {
    const casi = conJ0(principal, { ...VACIO, TRIGO: 1, MINERAL: 3 });
    expect(entrada(casi, 'CONSTRUIR_CIUDAD')).toEqual({
      tipo: 'CONSTRUIR_CIUDAD',
      disponible: false,
      motivo: 'RECURSOS_INSUFICIENTES',
      falta: { TRIGO: 1 },
    });
  });

  it('con recursos y un poblado propio: CONSTRUIR_CIUDAD disponible, sin motivo ni falta', () => {
    expect(entrada(conJ0(principal, SOBRADO), 'CONSTRUIR_CIUDAD')).toEqual({
      tipo: 'CONSTRUIR_CIUDAD',
      disponible: true,
    });
  });

  it('con recursos pero sin lugar → SIN_LUGAR_VALIDO', () => {
    // Sin poblados propios no hay dónde poner ciudad; el camino centro-n0 no deja poblado a distancia 2.
    const sinPoblado = conJ0(conCambios(principal, { edificios: {} }), SOBRADO);
    expect(entrada(sinPoblado, 'CONSTRUIR_CIUDAD')).toEqual({
      tipo: 'CONSTRUIR_CIUDAD',
      disponible: false,
      motivo: 'SIN_LUGAR_VALIDO',
    });
    expect(entrada(conJ0(principal, SOBRADO), 'CONSTRUIR_POBLADO')).toEqual({
      tipo: 'CONSTRUIR_POBLADO',
      disponible: false,
      motivo: 'SIN_LUGAR_VALIDO',
    });
  });

  it('sin piezas → SIN_PIEZAS aunque haya recursos', () => {
    const sinCiudades = conJ0(principal, SOBRADO, { ciudades: 0 });
    expect(entrada(sinCiudades, 'CONSTRUIR_CIUDAD')).toEqual({
      tipo: 'CONSTRUIR_CIUDAD',
      disponible: false,
      motivo: 'SIN_PIEZAS',
    });
  });

  it('tipos fuera de fase → FASE_INCORRECTA; TERMINAR_TURNO disponible', () => {
    const disponibles = accionesDisponibles(mesa, principal, j0);
    const motivos = Object.fromEntries(disponibles.map((d) => [d.tipo, d.motivo ?? 'OK']));
    expect(motivos).toEqual({
      COLOCAR_POBLADO_INICIAL: 'FASE_INCORRECTA',
      COLOCAR_CAMINO_INICIAL: 'FASE_INCORRECTA',
      TIRAR_DADOS: 'FASE_INCORRECTA',
      DESCARTAR_RECURSOS: 'FASE_INCORRECTA',
      DESCARTE_AUTOMATICO: 'FASE_INCORRECTA',
      MOVER_LADRON: 'FASE_INCORRECTA',
      SALTAR_TURNO_POR_INACTIVIDAD: 'OK',
      CONSTRUIR_CAMINO: 'RECURSOS_INSUFICIENTES',
      CONSTRUIR_POBLADO: 'RECURSOS_INSUFICIENTES',
      CONSTRUIR_CIUDAD: 'RECURSOS_INSUFICIENTES',
      CAMBIAR_CON_BANCA: 'RECURSOS_INSUFICIENTES',
      PROPONER_TRATO: 'RECURSOS_INSUFICIENTES',
      ACEPTAR_TRATO: 'TRATO_INEXISTENTE',
      CONFIRMAR_TRATO: 'TRATO_INEXISTENTE',
      RECHAZAR_TRATO: 'TRATO_INEXISTENTE',
      CANCELAR_TRATO: 'TRATO_INEXISTENTE',
      CONTRAOFERTAR_TRATO: 'TRATO_INEXISTENTE',
      COMPRAR_CARTA_DESARROLLO: 'RECURSOS_INSUFICIENTES',
      JUGAR_CABALLERO: 'NO_TIENES_ESA_CARTA',
      JUGAR_CONSTRUCCION_CARRETERAS: 'NO_TIENES_ESA_CARTA',
      JUGAR_ABUNDANCIA: 'NO_TIENES_ESA_CARTA',
      JUGAR_MONOPOLIO: 'NO_TIENES_ESA_CARTA',
      PASAR_CONSTRUCCION_ESPECIAL: 'FASE_INCORRECTA',
      TERMINAR_TURNO: 'OK',
    });
  });

  it('fuera de su turno: los tipos con NO_ES_TU_TURNO y nada enumerado', () => {
    const rico = conRecursos(principal, SOBRADO);
    expect(accionesDisponibles(mesa, rico, j1)).toEqual(
      TIPOS.map((tipo) => ({ tipo, disponible: false, motivo: 'NO_ES_TU_TURNO' })),
    );
    expect(enumerarAcciones(mesa, rico, j1)).toEqual([]);
  });

  it('jugador inexistente: ambas funciones lanzan un error claro', () => {
    expect(() => accionesDisponibles(mesa, principal, 'nadie')).toThrow(
      'El jugador "nadie" no participa en la partida',
    );
    expect(() => enumerarAcciones(mesa, principal, 'nadie')).toThrow(
      'El jugador "nadie" no participa en la partida',
    );
  });

  it('jugador con id vacío: lanza el mismo error', () => {
    expect(() => accionesDisponibles(mesa, principal, '')).toThrow(
      'El jugador "" no participa en la partida',
    );
    expect(() => enumerarAcciones(mesa, principal, '')).toThrow(
      'El jugador "" no participa en la partida',
    );
  });

  it('las respuestas son objetos nuevos en cada llamada', () => {
    const sinNada = conJ0(principal, VACIO);
    const a = entrada(sinNada, 'CONSTRUIR_CIUDAD')!;
    const b = entrada(sinNada, 'CONSTRUIR_CIUDAD')!;
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.falta).not.toBe(b.falta);
    const rico = conJ0(principal, SOBRADO);
    const [x] = enumerarAcciones(mesa, rico, j0);
    const [y] = enumerarAcciones(mesa, rico, j0);
    expect(x).toEqual(y);
    expect(x).not.toBe(y);
  });
});

describe('partida terminada', () => {
  const fin = conCambios(conRecursos(principal, SOBRADO), { fase: 'FIN', ganador: j0 });

  it.each([j0, j1])('enumerarAcciones devuelve [] y todo es PARTIDA_TERMINADA (%s)', (id) => {
    expect(enumerarAcciones(mesa, fin, id)).toEqual([]);
    expect(accionesDisponibles(mesa, fin, id)).toEqual(
      TIPOS.map((tipo) => ({ tipo, disponible: false, motivo: 'PARTIDA_TERMINADA' })),
    );
  });

  it('id desconocido con la partida terminada: lanza (el jugador se valida antes que la fase)', () => {
    expect(() => accionesDisponibles(mesa, fin, 'nadie')).toThrow(
      'El jugador "nadie" no participa en la partida',
    );
    expect(() => enumerarAcciones(mesa, fin, 'nadie')).toThrow(
      'El jugador "nadie" no participa en la partida',
    );
  });
});

describe('enumeración concreta en FASE_PRINCIPAL', () => {
  it('con recursos: caminos que salen de su red, ciudad en su poblado y terminar turno', () => {
    const rico = conJ0(principal, SOBRADO);
    const enumeradas = enumerarAcciones(mesa, rico, j0);
    const ciudades = enumeradas.filter((a) => a.tipo === 'CONSTRUIR_CIUDAD');
    expect(ciudades).toEqual([{ tipo: 'CONSTRUIR_CIUDAD', jugador: j0, vertice: centro.id }]);
    const caminos = enumeradas.filter((a) => a.tipo === 'CONSTRUIR_CAMINO');
    // Del centro salen 2 aristas libres más y de n0 al menos 1.
    expect(caminos.length).toBeGreaterThanOrEqual(3);
    expect(caminos.map((a) => 'arista' in a && a.arista)).not.toContain(aristaCentroN0);
    expect(enumeradas.filter((a) => a.tipo === 'TERMINAR_TURNO')).toHaveLength(1);
    expect(enumeradas.some((a) => a.tipo === 'CONSTRUIR_POBLADO')).toBe(false);
  });

  it('CONSTRUIR_POBLADO: exactamente los vértices de su red a distancia ≥ 2 de todo edificio', () => {
    // Camino centro-n0-x: x está a distancia 2 del poblado del centro.
    const x = mesa.vertice(n0)!.vecinos.find((v) => v !== centro.id)!;
    const conRed = conJ0(
      conCambios(principal, {
        caminos: { [aristaCentroN0]: j0, [aristaEntre(mesa, n0, x)]: j0 },
      }),
      SOBRADO,
    );
    // Esperado por geometría: vértices que tocan sus caminos, libres y sin edificio vecino.
    const red = new Set(Object.keys(conRed.caminos).flatMap((a) => mesa.arista(a)!.vertices));
    const esperados = [...red].filter(
      (v) =>
        !(v in conRed.edificios) && mesa.vertice(v)!.vecinos.every((n) => !(n in conRed.edificios)),
    );
    expect(esperados).toEqual([x]);

    const poblados = enumerarAcciones(mesa, conRed, j0).filter(
      (a) => a.tipo === 'CONSTRUIR_POBLADO',
    );
    expect(poblados.map((a) => ('vertice' in a ? a.vertice : null)).toSorted()).toEqual(
      esperados.toSorted(),
    );
    expect(entrada(conRed, 'CONSTRUIR_POBLADO')).toEqual({
      tipo: 'CONSTRUIR_POBLADO',
      disponible: true,
    });

    // Contrarios del mismo estado: n0 (demasiado cerca) y un vértice a distancia 2 sin camino.
    const otroVecino = centro.vecinos[1]!;
    const sinCamino = mesa.vertice(otroVecino)!.vecinos.find((v) => v !== centro.id)!;
    const vertices = poblados.map((a) => ('vertice' in a ? a.vertice : null));
    expect(vertices).not.toContain(n0);
    expect(vertices).not.toContain(sinCamino);
  });
});
