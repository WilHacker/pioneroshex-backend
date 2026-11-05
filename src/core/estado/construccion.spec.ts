import { describe, expect, it } from 'vitest';
import { COSTOS, type LimitesDePiezas } from '../reglas/costos.js';
import type { Recurso } from '../reglas/recursos.js';
import { aplicar } from './aplicar.js';
import { decidirConstruccion } from './construccion.js';
import { crearPartida } from './crear.js';
import { decidir } from './decidir.js';
import { aristaEntre, conCambios, mesaDePrueba } from './pruebas.js';
import type { Accion, Edificio, Estado, Jugador } from './tipos.js';

const mesa = mesaDePrueba();
const inicial = crearPartida(mesa, ['a', 'b', 'c', 'd']);
const [j0, j1] = inicial.jugadores.map((j) => j.id) as [string, string];
const principal = conCambios(inicial, { fase: 'FASE_PRINCIPAL', pasoPreparacion: 8 });

// Cadena: centro - n0 - x (x a distancia 2 del centro).
const centro = mesa.mapa.vertices.find(
  (v) =>
    v.vecinos.length === 3 && v.vecinos.every((n) => (mesa.vertice(n)?.vecinos.length ?? 0) >= 2),
)!;
const n0 = centro.vecinos[0]!;
const x = mesa.vertice(n0)!.vecinos.find((v) => v !== centro.id)!;
const aristaCentroN0 = aristaEntre(mesa, centro.id, n0);
const aristaN0X = aristaEntre(mesa, n0, x);

const SOBRADO: Record<Recurso, number> = { MADERA: 9, LADRILLO: 9, OVEJA: 9, TRIGO: 9, MINERAL: 9 };
const VACIO: Record<Recurso, number> = { MADERA: 0, LADRILLO: 0, OVEJA: 0, TRIGO: 0, MINERAL: 0 };
const poblado = (dueno: string): Edificio => ({ dueno, tipo: 'POBLADO' });
const ciudad = (dueno: string): Edificio => ({ dueno, tipo: 'CIUDAD' });

/** Cambia recursos o piezas de j0 sin tocar al resto (copia nueva). */
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
const yo = (estado: Estado): Jugador => estado.jugadores.find((j) => j.id === j0)!;

/** j0 con poblado en el centro y camino centro-n0, con recursos de sobra. */
const listo = conJ0(
  conCambios(principal, {
    edificios: { [centro.id]: poblado(j0) },
    caminos: { [aristaCentroN0]: j0 },
  }),
  SOBRADO,
);
/** Además con camino n0-x: x admite un poblado. */
const listoParaPoblado = conCambios(listo, {
  caminos: { [aristaCentroN0]: j0, [aristaN0X]: j0 },
});

const camino = (arista: string): Accion => ({ tipo: 'CONSTRUIR_CAMINO', jugador: j0, arista });
const pobladoEn = (vertice: string): Accion => ({
  tipo: 'CONSTRUIR_POBLADO',
  jugador: j0,
  vertice,
});
const ciudadEn = (vertice: string): Accion => ({ tipo: 'CONSTRUIR_CIUDAD', jugador: j0, vertice });

function aplicarOk(estado: Estado, accion: Accion) {
  const r = aplicar(mesa, estado, accion);
  if (!r.ok) throw new Error(r.motivo);
  return r;
}

describe('construcción exitosa', () => {
  it('CONSTRUIR_CAMINO: evento con origen CONSTRUCCION y costo copia de COSTOS', () => {
    const r = decidir(mesa, listo, camino(aristaN0X));
    if (!r.ok) throw new Error(r.motivo);
    expect(r.eventos).toEqual([
      {
        tipo: 'CAMINO_COLOCADO',
        jugador: j0,
        arista: aristaN0X,
        origen: 'CONSTRUCCION',
        costo: COSTOS.CAMINO,
      },
    ]);
    const evento = r.eventos[0];
    if (evento?.tipo !== 'CAMINO_COLOCADO') throw new Error('Se esperaba CAMINO_COLOCADO');
    expect(evento.costo).not.toBe(COSTOS.CAMINO);
  });

  it('CONSTRUIR_CAMINO al aplicar: camino, pieza, recursos y banco', () => {
    const { estado } = aplicarOk(listo, camino(aristaN0X));
    expect(estado.caminos[aristaN0X]).toBe(j0);
    expect(yo(estado).piezasRestantes.caminos).toBe(yo(listo).piezasRestantes.caminos - 1);
    expect(yo(estado).recursos).toEqual({ ...SOBRADO, MADERA: 8, LADRILLO: 8 });
    expect(estado.banco.MADERA).toBe(listo.banco.MADERA + 1);
    expect(estado.banco.LADRILLO).toBe(listo.banco.LADRILLO + 1);
    expect(estado.banco.TRIGO).toBe(listo.banco.TRIGO);
  });

  it('CONSTRUIR_POBLADO: evento con origen CONSTRUCCION y costo copia de COSTOS', () => {
    const r = decidir(mesa, listoParaPoblado, pobladoEn(x));
    if (!r.ok) throw new Error(r.motivo);
    expect(r.eventos).toEqual([
      {
        tipo: 'POBLADO_COLOCADO',
        jugador: j0,
        vertice: x,
        origen: 'CONSTRUCCION',
        costo: COSTOS.POBLADO,
      },
    ]);
    const evento = r.eventos[0];
    if (evento?.tipo !== 'POBLADO_COLOCADO') throw new Error('Se esperaba POBLADO_COLOCADO');
    expect(evento.costo).not.toBe(COSTOS.POBLADO);
  });

  it('CONSTRUIR_POBLADO al aplicar: edificio, pieza, recursos y banco', () => {
    const { estado } = aplicarOk(listoParaPoblado, pobladoEn(x));
    expect(estado.edificios[x]).toEqual(poblado(j0));
    expect(yo(estado).piezasRestantes.poblados).toBe(
      yo(listoParaPoblado).piezasRestantes.poblados - 1,
    );
    expect(yo(estado).recursos).toEqual({
      ...SOBRADO,
      MADERA: 8,
      LADRILLO: 8,
      OVEJA: 8,
      TRIGO: 8,
    });
    expect(estado.banco.OVEJA).toBe(listoParaPoblado.banco.OVEJA + 1);
    expect(estado.banco.MINERAL).toBe(listoParaPoblado.banco.MINERAL);
  });

  it('CONSTRUIR_CIUDAD: evento con costo copia de COSTOS', () => {
    const r = decidir(mesa, listo, ciudadEn(centro.id));
    if (!r.ok) throw new Error(r.motivo);
    expect(r.eventos).toEqual([
      { tipo: 'CIUDAD_COLOCADA', jugador: j0, vertice: centro.id, costo: COSTOS.CIUDAD },
    ]);
    const evento = r.eventos[0];
    if (evento?.tipo !== 'CIUDAD_COLOCADA') throw new Error('Se esperaba CIUDAD_COLOCADA');
    expect(evento.costo).not.toBe(COSTOS.CIUDAD);
  });

  it('CONSTRUIR_CIUDAD al aplicar: ciudad, devuelve el poblado, recursos y banco', () => {
    const { estado } = aplicarOk(listo, ciudadEn(centro.id));
    expect(estado.edificios[centro.id]).toEqual(ciudad(j0));
    expect(yo(estado).piezasRestantes).toEqual({
      ...yo(listo).piezasRestantes,
      poblados: yo(listo).piezasRestantes.poblados + 1,
      ciudades: yo(listo).piezasRestantes.ciudades - 1,
    });
    expect(yo(estado).recursos).toEqual({ ...SOBRADO, TRIGO: 7, MINERAL: 6 });
    expect(estado.banco.MINERAL).toBe(listo.banco.MINERAL + 3);
  });

  it('la ciudad solo mira la reserva de ciudades (sin poblados en reserva se puede subir)', () => {
    const estado = conJ0(listo, {}, { poblados: 0, caminos: 0 });
    expect(decidir(mesa, estado, ciudadEn(centro.id)).ok).toBe(true);
  });

  it('con los recursos justos se construye', () => {
    const estado = conJ0(listo, { ...VACIO, TRIGO: 2, MINERAL: 3 });
    expect(decidir(mesa, estado, ciudadEn(centro.id)).ok).toBe(true);
  });

  it('no muta el estado recibido', () => {
    const copia = structuredClone(listoParaPoblado);
    aplicar(mesa, listoParaPoblado, pobladoEn(x));
    aplicar(mesa, listoParaPoblado, ciudadEn(centro.id));
    expect(listoParaPoblado).toEqual(copia);
  });
});

describe('construcción rechazada', () => {
  const tipos = [camino(aristaN0X), pobladoEn(x), ciudadEn(centro.id)];

  it.each(
    (['PREPARACION_POBLADO', 'PREPARACION_CAMINO', 'PRE_TIRADA'] as const).flatMap((fase) =>
      tipos.map((accion) => ({ fase, accion })),
    ),
  )('en $fase → FASE_INCORRECTA ($accion.tipo)', ({ fase, accion }) => {
    const estado = conCambios(listoParaPoblado, { fase });
    expect(decidir(mesa, estado, accion)).toEqual({ ok: false, motivo: 'FASE_INCORRECTA' });
  });

  it.each([
    { accion: camino(aristaN0X), reserva: 'caminos' },
    { accion: pobladoEn(x), reserva: 'poblados' },
    { accion: ciudadEn(centro.id), reserva: 'ciudades' },
  ] as const)(
    'reserva de $reserva vacía con recursos de sobra → SIN_PIEZAS',
    ({ accion, reserva }) => {
      const estado = conJ0(listoParaPoblado, {}, { [reserva]: 0 });
      expect(decidir(mesa, estado, accion)).toEqual({ ok: false, motivo: 'SIN_PIEZAS' });
    },
  );

  it.each([
    { accion: ciudadEn(centro.id), recursos: { TRIGO: 1 }, falta: { TRIGO: 1, MINERAL: 3 } },
    { accion: camino(aristaN0X), recursos: {}, falta: { MADERA: 1, LADRILLO: 1 } },
    {
      accion: pobladoEn(x),
      recursos: { MADERA: 1, OVEJA: 3 },
      falta: { LADRILLO: 1, TRIGO: 1 },
    },
  ])(
    'sin recursos → RECURSOS_INSUFICIENTES con la falta exacta ($accion.tipo)',
    ({ accion, recursos, falta }) => {
      const estado = conJ0(listoParaPoblado, { ...VACIO, ...recursos });
      expect(decidir(mesa, estado, accion)).toEqual({
        ok: false,
        motivo: 'RECURSOS_INSUFICIENTES',
        falta,
      });
    },
  );

  describe('varios motivos a la vez: gana el primero del orden', () => {
    it('fase incorrecta, sin piezas y sin recursos → FASE_INCORRECTA', () => {
      const estado = conJ0(conCambios(listo, { fase: 'PRE_TIRADA' }), VACIO, { caminos: 0 });
      expect(decidir(mesa, estado, camino(aristaN0X))).toEqual({
        ok: false,
        motivo: 'FASE_INCORRECTA',
      });
    });

    it('sin piezas y sin recursos → SIN_PIEZAS', () => {
      const estado = conJ0(listo, VACIO, { ciudades: 0 });
      expect(decidir(mesa, estado, ciudadEn(centro.id))).toEqual({
        ok: false,
        motivo: 'SIN_PIEZAS',
      });
    });

    it('sin recursos y sin conexión → RECURSOS_INSUFICIENTES', () => {
      const estado = conJ0(conCambios(principal, {}), VACIO);
      expect(decidir(mesa, estado, pobladoEn(x))).toEqual({
        ok: false,
        motivo: 'RECURSOS_INSUFICIENTES',
        falta: { MADERA: 1, LADRILLO: 1, OVEJA: 1, TRIGO: 1 },
      });
    });

    it.each([
      { accion: camino('no-existe'), reserva: 'caminos' },
      { accion: camino(aristaCentroN0), reserva: 'caminos' },
      { accion: pobladoEn(n0), reserva: 'poblados' },
      { accion: ciudadEn('no-existe'), reserva: 'ciudades' },
    ] as const)(
      'sin piezas y con posición inválida → SIN_PIEZAS ($accion.tipo)',
      ({ accion, reserva }) => {
        const estado = conJ0(listo, {}, { [reserva]: 0 });
        expect(decidir(mesa, estado, accion)).toEqual({ ok: false, motivo: 'SIN_PIEZAS' });
      },
    );

    it.each([
      { accion: camino('no-existe'), falta: { MADERA: 1, LADRILLO: 1 } },
      { accion: pobladoEn('no-existe'), falta: { MADERA: 1, LADRILLO: 1, OVEJA: 1, TRIGO: 1 } },
      { accion: ciudadEn('no-existe'), falta: { TRIGO: 2, MINERAL: 3 } },
    ])(
      'sin recursos y con un ID inventado → RECURSOS_INSUFICIENTES, no *_INEXISTENTE ($accion.tipo)',
      ({ accion, falta }) => {
        const estado = conJ0(listo, VACIO);
        expect(decidir(mesa, estado, accion)).toEqual({
          ok: false,
          motivo: 'RECURSOS_INSUFICIENTES',
          falta,
        });
      },
    );
  });

  describe('posición del camino', () => {
    it('sin conexión → SIN_CONEXION', () => {
      const estado = conJ0(principal, SOBRADO);
      expect(decidir(mesa, estado, camino(aristaN0X))).toEqual({
        ok: false,
        motivo: 'SIN_CONEXION',
      });
    });

    it('cortado por un edificio rival → CAMINO_CORTADO', () => {
      const estado = conCambios(listo, { edificios: { [n0]: poblado(j1) } });
      expect(decidir(mesa, estado, camino(aristaN0X))).toEqual({
        ok: false,
        motivo: 'CAMINO_CORTADO',
        detalle: { verticeCortado: n0, dueno: j1 },
      });
    });

    it('arista ocupada → ARISTA_OCUPADA', () => {
      expect(decidir(mesa, listo, camino(aristaCentroN0))).toEqual({
        ok: false,
        motivo: 'ARISTA_OCUPADA',
        detalle: { dueno: listo.caminos[aristaCentroN0] },
      });
    });

    it('arista inventada → ARISTA_INEXISTENTE', () => {
      expect(decidir(mesa, listo, camino('no-existe'))).toEqual({
        ok: false,
        motivo: 'ARISTA_INEXISTENTE',
      });
    });
  });

  describe('posición del poblado', () => {
    it('sin camino propio → SIN_CONEXION', () => {
      expect(decidir(mesa, listo, pobladoEn(x))).toEqual({ ok: false, motivo: 'SIN_CONEXION' });
    });

    it('junto a otro edificio → DEMASIADO_CERCA', () => {
      expect(decidir(mesa, listo, pobladoEn(n0))).toEqual({
        ok: false,
        motivo: 'DEMASIADO_CERCA',
        detalle: { vecinoOcupado: centro.id, dueno: listo.edificios[centro.id]?.dueno },
      });
    });

    it('vértice ocupado → VERTICE_OCUPADO', () => {
      expect(decidir(mesa, listo, pobladoEn(centro.id))).toEqual({
        ok: false,
        motivo: 'VERTICE_OCUPADO',
        detalle: { dueno: listo.edificios[centro.id]?.dueno },
      });
    });

    it('vértice inventado → VERTICE_INEXISTENTE', () => {
      expect(decidir(mesa, listo, pobladoEn('no-existe'))).toEqual({
        ok: false,
        motivo: 'VERTICE_INEXISTENTE',
      });
    });
  });

  describe('posición de la ciudad', () => {
    it.each([
      ['un poblado ajeno', { [centro.id]: poblado(j1) }],
      ['una ciudad propia', { [centro.id]: ciudad(j0) }],
      ['un vértice vacío', {}],
    ])('sobre %s → NO_ES_TU_POBLADO', (_caso, edificios) => {
      const estado = conCambios(listo, { edificios });
      expect(decidir(mesa, estado, ciudadEn(centro.id))).toEqual({
        ok: false,
        motivo: 'NO_ES_TU_POBLADO',
      });
    });

    it('vértice inventado → VERTICE_INEXISTENTE', () => {
      expect(decidir(mesa, listo, ciudadEn('no-existe'))).toEqual({
        ok: false,
        motivo: 'VERTICE_INEXISTENTE',
      });
    });
  });

  it('llamada directa con una acción que no es de construcción → FASE_INCORRECTA', () => {
    expect(decidirConstruccion(mesa, listo, { tipo: 'TIRAR_DADOS', jugador: j0 })).toEqual({
      ok: false,
      motivo: 'FASE_INCORRECTA',
    });
  });

  it.each(['inventado', 'constructor', 'toString', '__proto__'])(
    'llamada directa con el tipo heredado o inventado %j → FASE_INCORRECTA sin lanzar',
    (tipo) => {
      const accion = { tipo, jugador: j0, vertice: centro.id } as unknown as Accion;
      const copia = structuredClone(listo);
      expect(decidirConstruccion(mesa, listo, accion)).toEqual({
        ok: false,
        motivo: 'FASE_INCORRECTA',
      });
      expect(listo).toEqual(copia);
    },
  );

  it('llamada directa con un jugador desconocido → JUGADOR_DESCONOCIDO', () => {
    const accion: Accion = { tipo: 'CONSTRUIR_CIUDAD', jugador: 'nadie', vertice: centro.id };
    expect(decidirConstruccion(mesa, listo, accion)).toEqual({
      ok: false,
      motivo: 'JUGADOR_DESCONOCIDO',
    });
  });
});

describe('victoria', () => {
  /** j0 con `n` poblados (en los primeros vértices) y recursos de sobra. */
  const conPoblados = (n: number): Estado =>
    conJ0(
      conCambios(principal, {
        edificios: Object.fromEntries(
          mesa.mapa.vertices.slice(0, n).map((v) => [v.id, poblado(j0)]),
        ),
      }),
      SOBRADO,
    );
  const primero = mesa.mapa.vertices[0]!.id;

  it('con 9 puntos, subir una ciudad termina en PARTIDA_GANADA con 10 puntos', () => {
    const r = decidir(mesa, conPoblados(9), ciudadEn(primero));
    if (!r.ok) throw new Error(r.motivo);
    expect(r.eventos.map((e) => e.tipo)).toEqual(['CIUDAD_COLOCADA', 'PARTIDA_GANADA']);
    expect(r.eventos.at(-1)).toEqual({ tipo: 'PARTIDA_GANADA', jugador: j0, puntos: 10 });
  });

  it('al aplicar: fase FIN y ganador; después cualquier acción → PARTIDA_TERMINADA', () => {
    const { estado } = aplicarOk(conPoblados(9), ciudadEn(primero));
    expect(estado.fase).toBe('FIN');
    expect(estado.ganador).toBe(j0);
    const despues: Accion[] = [
      { tipo: 'TERMINAR_TURNO', jugador: j0 },
      { tipo: 'TIRAR_DADOS', jugador: j1 },
      ciudadEn(mesa.mapa.vertices[1]!.id),
    ];
    for (const accion of despues) {
      expect(decidir(mesa, estado, accion)).toEqual({ ok: false, motivo: 'PARTIDA_TERMINADA' });
    }
  });

  it('con 8 puntos, subir una ciudad no gana', () => {
    const r = decidir(mesa, conPoblados(8), ciudadEn(primero));
    if (!r.ok) throw new Error(r.motivo);
    expect(r.eventos.map((e) => e.tipo)).toEqual(['CIUDAD_COLOCADA']);
  });

  it('un poblado que alcanza los puntos de victoria también gana', () => {
    const corta = mesaDePrueba({ puntosVictoria: 3 });
    const partida = crearPartida(corta, ['a', 'b', 'c', 'd']);
    const yoId = partida.jugadores[0]!.id;
    const estado = conCambios(partida, {
      fase: 'FASE_PRINCIPAL',
      pasoPreparacion: 8,
      edificios: { [centro.id]: ciudad(yoId) },
      caminos: { [aristaCentroN0]: yoId, [aristaN0X]: yoId },
      jugadores: partida.jugadores.with(0, { ...partida.jugadores[0]!, recursos: SOBRADO }),
    });
    const r = decidir(corta, estado, { tipo: 'CONSTRUIR_POBLADO', jugador: yoId, vertice: x });
    if (!r.ok) throw new Error(r.motivo);
    expect(r.eventos.at(-1)).toEqual({ tipo: 'PARTIDA_GANADA', jugador: yoId, puntos: 3 });
  });

  it('un camino nunca dispara la victoria', () => {
    const estado = conCambios(conPoblados(9), {
      caminos: { [aristaEntre(mesa, primero, mesa.vertice(primero)!.vecinos[0]!)]: j0 },
    });
    const otra = mesa.vertice(primero)!.vecinos[1]!;
    const r = decidir(mesa, estado, camino(aristaEntre(mesa, primero, otra)));
    if (!r.ok) throw new Error(r.motivo);
    expect(r.eventos.map((e) => e.tipo)).toEqual(['CAMINO_COLOCADO']);
  });

  it('permite construir en CONSTRUCCION_ESPECIAL al jugador en turnoEspecialDe', () => {
    const estadoEspecial = conCambios(listo, {
      fase: 'CONSTRUCCION_ESPECIAL',
      turnoDe: 1,
      turnoEspecialDe: 0,
    });
    const r = decidir(mesa, estadoEspecial, camino(aristaN0X));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.eventos[0]?.tipo).toBe('CAMINO_COLOCADO');
  });
});
