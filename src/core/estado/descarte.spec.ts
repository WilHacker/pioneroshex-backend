import { describe, expect, it } from 'vitest';
import type { Recurso } from '../reglas/recursos.js';
import { crearPartida } from './crear.js';
import { decidir } from './decidir.js';
import { evolucionar } from './evolucionar.js';
import { conCambios, mesaDePrueba } from './pruebas.js';
import type { Accion, Estado, JugadorId } from './tipos.js';

const mesa = mesaDePrueba();
const partida = crearPartida(mesa, ['a', 'b', 'c', 'd']);
const [j0, j1, j2] = partida.jugadores.map((j) => j.id) as [JugadorId, JugadorId, JugadorId];

const conRecursos = (
  estado: Estado,
  jugadorId: JugadorId,
  recursos: Partial<Record<Recurso, number>>,
): Estado =>
  conCambios(estado, {
    jugadores: estado.jugadores.map((j) =>
      j.id === jugadorId ? { ...j, recursos: { ...j.recursos, ...recursos } } : j,
    ),
  });

describe('TIRADA DE 7: transición a DESCARTE o MOVER_LADRON', () => {
  it('si nadie supera robberHandLimit (7), pasa directo a MOVER_LADRON', () => {
    for (let i = 0; i < 500; i++) {
      const m = mesaDePrueba({ semillaAzar: `s-${i}` });
      const p = conCambios(partida, { config: m.config, fase: 'PRE_TIRADA' });
      const res = decidir(m, p, { tipo: 'TIRAR_DADOS', jugador: j0 });
      if (res.ok && res.eventos[0]?.tipo === 'DADOS_TIRADOS') {
        const [d1, d2] = res.eventos[0].dados;
        if (d1 + d2 === 7) {
          expect(res.eventos.at(-1)).toEqual({
            tipo: 'FASE_CAMBIADA',
            fase: 'MOVER_LADRON',
            turnoDe: 0,
            pasoPreparacion: 0,
          });
          return;
        }
      }
    }
  });

  it('si algún jugador supera robberHandLimit (7), emite DESCARTE_REQUERIDO y pasa a DESCARTE', () => {
    for (let i = 0; i < 500; i++) {
      const m = mesaDePrueba({ semillaAzar: `s-${i}` });
      // j1 tiene 8 cartas (debe descartar 4); j2 tiene 9 cartas (debe descartar 4); j0 tiene 6 cartas (no descarta)
      const p = conRecursos(
        conRecursos(
          conRecursos(conCambios(partida, { config: m.config, fase: 'PRE_TIRADA' }), j0, {
            MADERA: 6,
          }),
          j1,
          { OVEJA: 8 },
        ),
        j2,
        { TRIGO: 9 },
      );
      const res = decidir(m, p, { tipo: 'TIRAR_DADOS', jugador: j0 });
      if (res.ok && res.eventos[0]?.tipo === 'DADOS_TIRADOS') {
        const [d1, d2] = res.eventos[0].dados;
        if (d1 + d2 === 7) {
          expect(res.eventos).toContainEqual({
            tipo: 'DESCARTE_REQUERIDO',
            jugador: j1,
            cantidad: 4,
          });
          expect(res.eventos).toContainEqual({
            tipo: 'DESCARTE_REQUERIDO',
            jugador: j2,
            cantidad: 4,
          });
          expect(res.eventos.at(-1)).toEqual({
            tipo: 'FASE_CAMBIADA',
            fase: 'DESCARTE',
            turnoDe: 0,
            pasoPreparacion: 0,
          });
          return;
        }
      }
    }
  });
});

describe('Fase DESCARTE: DESCARTAR_RECURSOS', () => {
  const estadoDescarte: Estado = conRecursos(
    conCambios(partida, {
      fase: 'DESCARTE',
      descartesPendientes: { [j1]: 4, [j2]: 4 },
    }),
    j1,
    { MADERA: 4, OVEJA: 4 },
  );

  it('rechaza si el jugador no tiene descartes pendientes', () => {
    const accion: Accion = {
      tipo: 'DESCARTAR_RECURSOS',
      jugador: j0,
      recursos: { MADERA: 1 },
    };
    expect(decidir(mesa, estadoDescarte, accion)).toEqual({
      ok: false,
      motivo: 'NO_DEBES_DESCARTAR',
    });
  });

  it('rechaza si la cantidad descartada no coincide con lo pendiente', () => {
    const accion: Accion = {
      tipo: 'DESCARTAR_RECURSOS',
      jugador: j1,
      recursos: { MADERA: 3 }, // debe 4
    };
    expect(decidir(mesa, estadoDescarte, accion)).toEqual({
      ok: false,
      motivo: 'CANTIDAD_DESCARTE_INCORRECTA',
      detalle: { requerido: 4, entregado: 3 },
    });
  });

  it('rechaza si descarta más recursos de los que tiene en mano', () => {
    const accion: Accion = {
      tipo: 'DESCARTAR_RECURSOS',
      jugador: j1,
      recursos: { MINERAL: 4 }, // no tiene mineral
    };
    expect(decidir(mesa, estadoDescarte, accion)).toEqual({
      ok: false,
      motivo: 'RECURSOS_INSUFICIENTES',
      falta: { MINERAL: 4 },
    });
  });

  it('acepta descarte válido; mientras queden otros pendientes sigue en DESCARTE', () => {
    const accion: Accion = {
      tipo: 'DESCARTAR_RECURSOS',
      jugador: j1,
      recursos: { MADERA: 2, OVEJA: 2 },
    };
    const res = decidir(mesa, estadoDescarte, accion);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.eventos).toEqual([
      {
        tipo: 'RECURSOS_DESCARTADOS',
        jugador: j1,
        recursos: { MADERA: 2, OVEJA: 2 },
      },
    ]);
  });

  it('al resolver el último descarte pendiente, pasa a MOVER_LADRON', () => {
    const estadoUnSoloPendiente: Estado = conRecursos(
      conCambios(partida, {
        fase: 'DESCARTE',
        descartesPendientes: { [j1]: 4 },
      }),
      j1,
      { MADERA: 4 },
    );
    const accion: Accion = {
      tipo: 'DESCARTAR_RECURSOS',
      jugador: j1,
      recursos: { MADERA: 4 },
    };
    const res = decidir(mesa, estadoUnSoloPendiente, accion);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.eventos).toEqual([
      {
        tipo: 'RECURSOS_DESCARTADOS',
        jugador: j1,
        recursos: { MADERA: 4 },
      },
      {
        tipo: 'FASE_CAMBIADA',
        fase: 'MOVER_LADRON',
        turnoDe: estadoUnSoloPendiente.turnoDe,
        pasoPreparacion: estadoUnSoloPendiente.pasoPreparacion,
      },
    ]);
  });
});

describe('Fase DESCARTE: DESCARTE_AUTOMATICO', () => {
  it('descarta automáticamente la cantidad exacta pendiente de forma determinista', () => {
    const estado: Estado = conRecursos(
      conCambios(partida, {
        fase: 'DESCARTE',
        descartesPendientes: { [j1]: 4 },
      }),
      j1,
      { MADERA: 5, OVEJA: 3 },
    );
    const accion: Accion = {
      tipo: 'DESCARTE_AUTOMATICO',
      jugador: j1,
    };
    const res = decidir(mesa, estado, accion);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const ev = res.eventos.find((e) => e.tipo === 'RECURSOS_DESCARTADOS');
    expect(ev).toBeDefined();
    if (ev?.tipo !== 'RECURSOS_DESCARTADOS') return;

    const totalDescartado = Object.values(ev.recursos).reduce((s, n) => s + (n ?? 0), 0);
    expect(totalDescartado).toBe(4);
  });
});

describe('Fase DESCARTE: evolucionar', () => {
  it('devuelve recursos al banco y limpia descarte pendiente', () => {
    const estado: Estado = conRecursos(
      conCambios(partida, {
        fase: 'DESCARTE',
        descartesPendientes: { [j1]: 4 },
      }),
      j1,
      { MADERA: 4, OVEJA: 4 },
    );
    const bancoMaderaAntes = estado.banco.MADERA;

    const siguiente = evolucionar(estado, {
      tipo: 'RECURSOS_DESCARTADOS',
      jugador: j1,
      recursos: { MADERA: 3, OVEJA: 1 },
    });

    const j1Actualizado = siguiente.jugadores.find((j) => j.id === j1)!;
    expect(j1Actualizado.recursos.MADERA).toBe(1);
    expect(j1Actualizado.recursos.OVEJA).toBe(3);
    expect(siguiente.banco.MADERA).toBe(bancoMaderaAntes + 3);
    expect(siguiente.descartesPendientes[j1]).toBeUndefined();
  });
});
