import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { COSTOS } from '../reglas/costos.js';
import { crearPartida } from './crear.js';
import { evolucionar } from './evolucionar.js';
import { conCambios, mesaDePrueba } from './pruebas.js';
import type { Estado, Evento, Jugador } from './tipos.js';

const mesa = mesaDePrueba();
const inicial = crearPartida(mesa, ['a', 'b', 'c', 'd']);
const j0 = inicial.jugadores[0]!.id;
const vertice = mesa.mapa.vertices[0]!.id;
const arista = mesa.mapa.aristas[0]!.id;

const base: Estado = produce(inicial, (borrador) => {
  for (const j of borrador.jugadores) {
    j.recursos = { MADERA: 5, LADRILLO: 5, OVEJA: 5, TRIGO: 5, MINERAL: 5 };
  }
});
const yo = (estado: Estado): Jugador => estado.jugadores.find((j) => j.id === j0)!;

/** Aplica el evento comprobando que no muta la entrada y que la versión sube 1. */
function evolucionarSinMutar(estado: Estado, evento: Evento): Estado {
  const copia = structuredClone(estado);
  const nuevo = evolucionar(estado, evento);
  expect(estado).toEqual(copia);
  expect(nuevo.version).toBe(estado.version + 1);
  return nuevo;
}

describe('evolucionar', () => {
  it('POBLADO_COLOCADO de construcción: edificio, pieza, costo al banco; conserva el pendiente', () => {
    const costo = COSTOS.POBLADO;
    const pendiente = mesa.mapa.vertices[5]!.id;
    const conPendiente = conCambios(base, { pobladoPendiente: pendiente });
    const nuevo = evolucionarSinMutar(conPendiente, {
      tipo: 'POBLADO_COLOCADO',
      jugador: j0,
      vertice,
      origen: 'CONSTRUCCION',
      costo,
    });
    expect(nuevo.edificios[vertice]).toEqual({ dueno: j0, tipo: 'POBLADO' });
    expect(yo(nuevo).piezasRestantes.poblados).toBe(yo(base).piezasRestantes.poblados - 1);
    expect(yo(nuevo).recursos).toEqual({ MADERA: 4, LADRILLO: 4, OVEJA: 4, TRIGO: 4, MINERAL: 5 });
    expect(nuevo.banco.MADERA).toBe(base.banco.MADERA + 1);
    expect(nuevo.banco.MINERAL).toBe(base.banco.MINERAL);
    expect(nuevo.pobladoPendiente).toBe(pendiente);
  });

  it('POBLADO_COLOCADO de preparación fija pobladoPendiente', () => {
    const nuevo = evolucionarSinMutar(base, {
      tipo: 'POBLADO_COLOCADO',
      jugador: j0,
      vertice,
      origen: 'PREPARACION',
      costo: {},
    });
    expect(nuevo.pobladoPendiente).toBe(vertice);
    expect(yo(nuevo).recursos).toEqual(yo(base).recursos);
    expect(nuevo.banco).toEqual(base.banco);
  });

  it('CIUDAD_COLOCADA: tipo CIUDAD, devuelve un poblado, gasta una ciudad y paga', () => {
    const estado = conCambios(base, { edificios: { [vertice]: { dueno: j0, tipo: 'POBLADO' } } });
    const nuevo = evolucionarSinMutar(estado, {
      tipo: 'CIUDAD_COLOCADA',
      jugador: j0,
      vertice,
      costo: COSTOS.CIUDAD,
    });
    expect(nuevo.edificios[vertice]).toEqual({ dueno: j0, tipo: 'CIUDAD' });
    expect(yo(nuevo).piezasRestantes.poblados).toBe(yo(estado).piezasRestantes.poblados + 1);
    expect(yo(nuevo).piezasRestantes.ciudades).toBe(yo(estado).piezasRestantes.ciudades - 1);
    expect(yo(nuevo).recursos.TRIGO).toBe(3);
    expect(yo(nuevo).recursos.MINERAL).toBe(2);
    expect(nuevo.banco.MINERAL).toBe(estado.banco.MINERAL + 3);
  });

  it('CAMINO_COLOCADO de construcción: camino, pieza y costo', () => {
    const estado = conCambios(base, { pobladoPendiente: vertice });
    const nuevo = evolucionarSinMutar(estado, {
      tipo: 'CAMINO_COLOCADO',
      jugador: j0,
      arista,
      origen: 'CONSTRUCCION',
      costo: COSTOS.CAMINO,
    });
    expect(nuevo.caminos[arista]).toBe(j0);
    expect(yo(nuevo).piezasRestantes.caminos).toBe(yo(estado).piezasRestantes.caminos - 1);
    expect(yo(nuevo).recursos.MADERA).toBe(4);
    expect(yo(nuevo).recursos.LADRILLO).toBe(4);
    expect(nuevo.banco.LADRILLO).toBe(estado.banco.LADRILLO + 1);
    expect(nuevo.pobladoPendiente).toBe(vertice);
  });

  it('CAMINO_COLOCADO de preparación limpia pobladoPendiente', () => {
    const estado = conCambios(base, { pobladoPendiente: vertice });
    const nuevo = evolucionarSinMutar(estado, {
      tipo: 'CAMINO_COLOCADO',
      jugador: j0,
      arista,
      origen: 'PREPARACION',
      costo: {},
    });
    expect(nuevo.pobladoPendiente).toBeNull();
    expect(nuevo.caminos[arista]).toBe(j0);
  });

  it('DADOS_TIRADOS guarda los dados y cuenta la tirada', () => {
    const nuevo = evolucionarSinMutar(base, {
      tipo: 'DADOS_TIRADOS',
      jugador: j0,
      dados: [3, 4],
      causa: 'VOLUNTARIA',
    });
    expect(nuevo.dados).toEqual([3, 4]);
    expect(nuevo.tiradas).toBe(base.tiradas + 1);
  });

  it('RECURSOS_REPARTIDOS pasa cartas del banco a la mano', () => {
    const nuevo = evolucionarSinMutar(base, {
      tipo: 'RECURSOS_REPARTIDOS',
      jugador: j0,
      recurso: 'OVEJA',
      cantidad: 2,
      pedido: 2,
      recortado: 0,
      causa: { tipo: 'PREPARACION', vertice, casilla: '0,0,0' },
    });
    expect(yo(nuevo).recursos.OVEJA).toBe(7);
    expect(nuevo.banco.OVEJA).toBe(base.banco.OVEJA - 2);
  });

  it('PRODUCCION_BLOQUEADA solo sube la versión', () => {
    const nuevo = evolucionarSinMutar(base, {
      tipo: 'PRODUCCION_BLOQUEADA',
      recurso: 'TRIGO',
      pedido: 3,
      disponible: 1,
    });
    expect(nuevo).toEqual({ ...base, version: base.version + 1 });
  });

  it('FASE_CAMBIADA fija fase, turnoDe y pasoPreparacion', () => {
    const nuevo = evolucionarSinMutar(base, {
      tipo: 'FASE_CAMBIADA',
      fase: 'PREPARACION_CAMINO',
      turnoDe: 2,
      pasoPreparacion: 3,
    });
    expect(nuevo).toMatchObject({ fase: 'PREPARACION_CAMINO', turnoDe: 2, pasoPreparacion: 3 });
  });

  it('TURNO_TERMINADO pasa el turno, vuelve a PRE_TIRADA y borra los dados', () => {
    const estado = conCambios(base, { fase: 'FASE_PRINCIPAL', dados: [6, 6] });
    const nuevo = evolucionarSinMutar(estado, {
      tipo: 'TURNO_TERMINADO',
      jugador: j0,
      causa: 'VOLUNTARIA',
      siguiente: 1,
    });
    expect(nuevo).toMatchObject({ turnoDe: 1, fase: 'PRE_TIRADA', dados: null });
  });

  it('PARTIDA_GANADA termina la partida con ganador', () => {
    const nuevo = evolucionarSinMutar(base, { tipo: 'PARTIDA_GANADA', jugador: j0, puntos: 10 });
    expect(nuevo).toMatchObject({ fase: 'FIN', ganador: j0 });
  });

  describe('comercio entre jugadores y fase especial', () => {
    const j1 = inicial.jugadores[1]!.id;
    const trato = {
      id: 'trato-xyz',
      proponente: j0,
      destinatario: null,
      entrega: { MADERA: 1, LADRILLO: 0, OVEJA: 0, TRIGO: 0, MINERAL: 0 },
      pide: { MADERA: 0, LADRILLO: 0, OVEJA: 1, TRIGO: 0, MINERAL: 0 },
      rechazadoPor: [],
      aceptadoPor: [],
    };

    it('TRATO_PROPUESTO agrega el trato a la lista', () => {
      const nuevo = evolucionarSinMutar(base, { tipo: 'TRATO_PROPUESTO', trato });
      expect(nuevo.tratos).toHaveLength(1);
      expect(nuevo.tratos[0]?.id).toBe('trato-xyz');
    });

    it('TRATO_PREACEPTADO anota quién aceptó y deja el trato abierto, sin mover cartas', () => {
      const conTrato = conCambios(base, { tratos: [trato] });
      const uno = evolucionarSinMutar(conTrato, {
        tipo: 'TRATO_PREACEPTADO',
        tratoId: 'trato-xyz',
        jugador: j1,
        proponente: j0,
      });
      expect(uno.tratos).toHaveLength(1);
      expect(uno.tratos[0]?.aceptadoPor).toEqual([j1]);
      expect(uno.jugadores).toEqual(conTrato.jugadores);
      // El trato original no se muta: el estado es inmutable.
      expect(conTrato.tratos[0]?.aceptadoPor).toEqual([]);
    });

    it('TRATO_ACEPTADO intercambia cartas y elimina el trato', () => {
      const conTrato = conCambios(base, { tratos: [trato] });
      const nuevo = evolucionarSinMutar(conTrato, {
        tipo: 'TRATO_ACEPTADO',
        tratoId: trato.id,
        proponente: j0,
        aceptante: j1,
        entrega: trato.entrega,
        pide: trato.pide,
      });
      expect(nuevo.tratos).toHaveLength(0);
      const prop = nuevo.jugadores.find((j) => j.id === j0)!;
      const acept = nuevo.jugadores.find((j) => j.id === j1)!;
      expect(prop.recursos.MADERA).toBe(4);
      expect(prop.recursos.OVEJA).toBe(6);
      expect(acept.recursos.MADERA).toBe(6);
      expect(acept.recursos.OVEJA).toBe(4);
    });

    it('TRATO_ACEPTADO descarta los otros tratos que su proponente ya no puede cumplir', () => {
      const j2 = inicial.jugadores[2]!.id;
      const pobre = conCambios(base, {
        jugadores: base.jugadores.map((j) =>
          j.id === j2 ? { ...j, recursos: { ...j.recursos, MADERA: 0 } } : j,
        ),
      });
      const imposible = { ...trato, id: 'imposible', proponente: j2 };
      const posible = { ...trato, id: 'posible', proponente: j1 };
      const nuevo = evolucionarSinMutar(
        conCambios(pobre, { tratos: [trato, imposible, posible] }),
        {
          tipo: 'TRATO_ACEPTADO',
          tratoId: trato.id,
          proponente: j0,
          aceptante: j1,
          entrega: trato.entrega,
          pide: trato.pide,
        },
      );
      expect(nuevo.tratos.map((t) => t.id)).toEqual(['posible']);
    });

    describe('TRATO_RECHAZADO', () => {
      const j2 = inicial.jugadores[2]!.id;
      const j3 = inicial.jugadores[3]!.id;

      it('un trato dirigido desaparece al rechazarlo su destinatario', () => {
        const dirigido = { ...trato, destinatario: j1 };
        const nuevo = evolucionarSinMutar(conCambios(base, { tratos: [dirigido] }), {
          tipo: 'TRATO_RECHAZADO',
          tratoId: dirigido.id,
          jugador: j1,
        });
        expect(nuevo.tratos).toHaveLength(0);
      });

      it('un trato abierto anota quién lo rechazó y sigue vivo mientras quede algún rival', () => {
        const nuevo = evolucionarSinMutar(conCambios(base, { tratos: [trato] }), {
          tipo: 'TRATO_RECHAZADO',
          tratoId: trato.id,
          jugador: j1,
        });
        expect(nuevo.tratos).toHaveLength(1);
        expect(nuevo.tratos[0]?.rechazadoPor).toEqual([j1]);
      });

      it('un trato abierto desaparece cuando lo han rechazado todos los rivales', () => {
        const casiTodos = { ...trato, rechazadoPor: [j1, j2] };
        const nuevo = evolucionarSinMutar(conCambios(base, { tratos: [casiTodos] }), {
          tipo: 'TRATO_RECHAZADO',
          tratoId: trato.id,
          jugador: j3,
        });
        expect(nuevo.tratos).toHaveLength(0);
      });

      it('rechazar un trato que ya no existe solo sube la versión', () => {
        const nuevo = evolucionarSinMutar(base, {
          tipo: 'TRATO_RECHAZADO',
          tratoId: 'fantasma',
          jugador: j1,
        });
        expect(nuevo.tratos).toEqual(base.tratos);
      });
    });

    it('FASE_ESPECIAL_INICIADA y CONSTRUCCION_ESPECIAL_PASADA', () => {
      const estadoEsp = evolucionarSinMutar(base, {
        tipo: 'FASE_ESPECIAL_INICIADA',
        turnoOriginal: 0,
        primerConstructor: 1,
      });
      expect(estadoEsp.fase).toBe('CONSTRUCCION_ESPECIAL');
      expect(estadoEsp.turnoEspecialDe).toBe(1);

      const estadoPasado = evolucionarSinMutar(estadoEsp, {
        tipo: 'CONSTRUCCION_ESPECIAL_PASADA',
        jugador: j1,
        causa: 'VOLUNTARIA',
        siguienteConstructor: 2,
      });
      expect(estadoPasado.turnoEspecialDe).toBe(2);
    });

    it('eventos de cartas de desarrollo, gran ejército y gran ruta', () => {
      // CARTA_DESARROLLO_COMPRADA
      const conMazo = conCambios(base, { mazo: ['CABALLERO', 'MONOPOLIO'] });
      const comp = evolucionarSinMutar(conMazo, {
        tipo: 'CARTA_DESARROLLO_COMPRADA',
        jugador: j0,
        carta: 'CABALLERO',
        costo: COSTOS.CARTA,
      });
      expect(comp.mazo).toEqual(['MONOPOLIO']);
      expect(yo(comp).cartasCompradasEsteTurno).toEqual(['CABALLERO']);
      expect(yo(comp).recursos.OVEJA).toBe(4);
      expect(yo(comp).recursos.TRIGO).toBe(4);
      expect(yo(comp).recursos.MINERAL).toBe(4);

      // TURNO_TERMINADO transfiere cartas compradas a cartas jugables
      const finTurno = evolucionarSinMutar(comp, {
        tipo: 'TURNO_TERMINADO',
        jugador: j0,
        causa: 'VOLUNTARIA',
        siguiente: 1,
      });
      expect(yo(finTurno).cartasCompradasEsteTurno).toEqual([]);
      expect(yo(finTurno).cartasDesarrollo).toEqual(['CABALLERO']);
      expect(finTurno.cartaJugadaEsteTurno).toBe(false);

      // CABALLERO_JUGADO
      const jugCaballero = evolucionarSinMutar(finTurno, {
        tipo: 'CABALLERO_JUGADO',
        jugador: j0,
        destino: { q: 1, r: -1, s: 0 },
        victima: null,
        recursoRobado: null,
      });
      expect(yo(jugCaballero).cartasDesarrollo).toEqual([]);
      expect(yo(jugCaballero).caballerosJugados).toBe(1);
      expect(jugCaballero.cartaJugadaEsteTurno).toBe(true);
      expect(jugCaballero.ladron).toEqual({ q: 1, r: -1, s: 0 });

      // GRAN_EJERCITO_CAMBIADO
      const granEj = evolucionarSinMutar(jugCaballero, {
        tipo: 'GRAN_EJERCITO_CAMBIADO',
        titularAnterior: null,
        nuevoTitular: j0,
        caballeros: 3,
      });
      expect(granEj.granEjercito).toBe(j0);

      // ABUNDANCIA_JUGADA
      const conAbundancia = produce(base, (b) => {
        b.jugadores[0]!.cartasDesarrollo = ['ABUNDANCIA'];
      });
      const jugAbundancia = evolucionarSinMutar(conAbundancia, {
        tipo: 'ABUNDANCIA_JUGADA',
        jugador: j0,
        recursos: ['MADERA', 'MINERAL'],
      });
      expect(yo(jugAbundancia).cartasDesarrollo).toEqual([]);
      expect(yo(jugAbundancia).recursos.MADERA).toBe(6);
      expect(yo(jugAbundancia).recursos.MINERAL).toBe(6);
      expect(jugAbundancia.banco.MADERA).toBe(base.banco.MADERA - 1);

      // MONOPOLIO_JUGADO
      const conMonopolio = produce(base, (b) => {
        b.jugadores[0]!.cartasDesarrollo = ['MONOPOLIO'];
        b.jugadores[1]!.recursos.TRIGO = 3;
        b.jugadores[2]!.recursos.TRIGO = 2;
        b.jugadores[3]!.recursos.TRIGO = 0;
      });
      const jugMonopolio = evolucionarSinMutar(conMonopolio, {
        tipo: 'MONOPOLIO_JUGADO',
        jugador: j0,
        recurso: 'TRIGO',
        cantidadRobada: 5,
      });
      expect(yo(jugMonopolio).cartasDesarrollo).toEqual([]);
      expect(yo(jugMonopolio).recursos.TRIGO).toBe(base.jugadores[0]!.recursos.TRIGO + 5);
      expect(jugMonopolio.jugadores[1]!.recursos.TRIGO).toBe(0);
      expect(jugMonopolio.jugadores[2]!.recursos.TRIGO).toBe(0);

      // CONSTRUCCION_CARRETERAS_JUGADA
      const arista1 = mesa.mapa.aristas[0]!.id;
      const arista2 = mesa.mapa.aristas[1]!.id;
      const conCarreteras = produce(base, (b) => {
        b.jugadores[0]!.cartasDesarrollo = ['CONSTRUCCION_CARRETERAS'];
      });
      const jugCarreteras = evolucionarSinMutar(conCarreteras, {
        tipo: 'CONSTRUCCION_CARRETERAS_JUGADA',
        jugador: j0,
        aristas: [arista1, arista2],
      });
      expect(yo(jugCarreteras).cartasDesarrollo).toEqual([]);
      expect(jugCarreteras.caminos[arista1]).toBe(j0);
      expect(jugCarreteras.caminos[arista2]).toBe(j0);
      expect(yo(jugCarreteras).piezasRestantes.caminos).toBe(yo(base).piezasRestantes.caminos - 2);

      // GRAN_RUTA_CAMBIADA
      const granRut = evolucionarSinMutar(jugCarreteras, {
        tipo: 'GRAN_RUTA_CAMBIADA',
        titularAnterior: null,
        nuevoTitular: j0,
        longitud: 5,
      });
      expect(granRut.granRuta).toBe(j0);
      expect(granRut.longitudGranRuta).toBe(5);
    });
  });

  it('un jugador inexistente lanza un error claro', () => {
    expect(() =>
      evolucionar(base, {
        tipo: 'DADOS_TIRADOS',
        jugador: 'nadie',
        dados: [1, 1],
        causa: 'VOLUNTARIA',
      }),
    ).toThrow('Jugador inexistente: nadie');
  });

  it('un evento de tipo desconocido lanza un error claro', () => {
    expect(() => evolucionar(base, { tipo: 'INVENTADO' } as never)).toThrow(
      'Evento desconocido: {"tipo":"INVENTADO"}',
    );
  });

  it('el estado resultante es serializable a JSON y está congelado', () => {
    const nuevo = evolucionar(base, {
      tipo: 'DADOS_TIRADOS',
      jugador: j0,
      dados: [2, 5],
      causa: 'VOLUNTARIA',
    });
    expect(JSON.parse(JSON.stringify(nuevo))).toEqual(nuevo);
    expect(Object.isFrozen(nuevo)).toBe(true);
    expect(Object.isFrozen(nuevo.dados)).toBe(true);
  });
});
