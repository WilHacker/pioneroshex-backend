import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { aplicar } from './aplicar.js';
import { crearPartida } from './crear.js';
import { decidir } from './decidir.js';
import { aristaEntre, mesaDePrueba } from './pruebas.js';
import type { Accion, Estado, Fase } from './tipos.js';

const mesa = mesaDePrueba();
const base = crearPartida(mesa, ['alice', 'bob', 'carol', 'dave']);
const [j0] = base.jugadores.map((j) => j.id) as [string];

// Una red de caminos para las carreteras gratis.
const v0 = mesa.mapa.vertices[0]!;
const v1 = mesa.vertice(v0.vecinos[0]!)!;
const v2 = mesa.vertice(v1.vecinos.find((id) => id !== v0.id)!)!;
const v3 = mesa.vertice(v2.vecinos.find((id) => id !== v1.id)!)!;
const e1 = aristaEntre(mesa, v0.id, v1.id);
const e2 = aristaEntre(mesa, v1.id, v2.id);
const e3 = aristaEntre(mesa, v2.id, v3.id);

/** Es mi turno, en `fase`, con la carta pedida ya en la mano (no comprada hoy). */
function conCarta(
  fase: Fase,
  carta: Estado['jugadores'][number]['cartasDesarrollo'][number],
): Estado {
  return produce(base, (b) => {
    b.fase = fase;
    b.turnoDe = 0;
    b.pasoPreparacion = 8;
    b.edificios[v0.id] = { dueno: j0, tipo: 'POBLADO' };
    b.caminos[e1] = j0;
    b.jugadores[0]!.cartasDesarrollo = [carta];
    for (let i = 1; i < b.jugadores.length; i++) {
      b.jugadores[i]!.recursos = { MADERA: 2, LADRILLO: 0, OVEJA: 0, TRIGO: 0, MINERAL: 0 };
    }
  });
}

const JUGADAS: readonly {
  nombre: string;
  carta: Parameters<typeof conCarta>[1];
  accion: Accion;
}[] = [
  {
    nombre: 'construcción de carreteras',
    carta: 'CONSTRUCCION_CARRETERAS',
    accion: { tipo: 'JUGAR_CONSTRUCCION_CARRETERAS', jugador: j0, aristas: [e2, e3] },
  },
  {
    nombre: 'año de la abundancia',
    carta: 'ABUNDANCIA',
    accion: { tipo: 'JUGAR_ABUNDANCIA', jugador: j0, recursos: ['MADERA', 'MINERAL'] },
  },
  {
    nombre: 'monopolio',
    carta: 'MONOPOLIO',
    accion: { tipo: 'JUGAR_MONOPOLIO', jugador: j0, recurso: 'MADERA' },
  },
];

describe('cartas de desarrollo antes de tirar los dados', () => {
  it.each(JUGADAS)('se puede jugar $nombre antes de tirar (PRE_TIRADA)', ({ carta, accion }) => {
    expect(decidir(mesa, conCarta('PRE_TIRADA', carta), accion).ok).toBe(true);
  });

  it.each(JUGADAS)('$nombre sigue valiendo en la fase principal', ({ carta, accion }) => {
    expect(decidir(mesa, conCarta('FASE_PRINCIPAL', carta), accion).ok).toBe(true);
  });

  it.each(JUGADAS)(
    '$nombre sigue sin valer en el descarte ni al mover el ladrón',
    ({ carta, accion }) => {
      for (const fase of ['DESCARTE', 'MOVER_LADRON'] as const) {
        const r = decidir(mesa, conCarta(fase, carta), accion);
        expect(r.ok).toBe(false);
      }
    },
  );

  it.each(JUGADAS)('tras jugar $nombre antes de tirar, todavía hay que tirar los dados', (j) => {
    const r = aplicar(mesa, conCarta('PRE_TIRADA', j.carta), j.accion);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estado.fase).toBe('PRE_TIRADA');
    expect(r.estado.cartaJugadaEsteTurno).toBe(true);
    expect(decidir(mesa, r.estado, { tipo: 'TIRAR_DADOS', jugador: j0 }).ok).toBe(true);
  });

  it('solo se juega una carta por turno, también antes de tirar', () => {
    const primera = aplicar(mesa, conCarta('PRE_TIRADA', 'MONOPOLIO'), JUGADAS[2]!.accion);
    if (!primera.ok) throw new Error(primera.motivo);
    const conOtra = produce(primera.estado, (b) => {
      b.jugadores[0]!.cartasDesarrollo = ['ABUNDANCIA'];
    });
    expect(decidir(mesa, conOtra, JUGADAS[1]!.accion)).toEqual({
      ok: false,
      motivo: 'YA_JUGASTE_CARTA_ESTE_TURNO',
    });
  });

  it('el monopolio de antes de tirar roba de verdad las cartas de los rivales', () => {
    const r = aplicar(mesa, conCarta('PRE_TIRADA', 'MONOPOLIO'), JUGADAS[2]!.accion);
    if (!r.ok) throw new Error(r.motivo);
    expect(r.estado.jugadores[0]!.recursos.MADERA).toBe(6);
    expect(r.estado.jugadores.slice(1).every((j) => j.recursos.MADERA === 0)).toBe(true);
  });
});
