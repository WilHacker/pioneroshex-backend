import { describe, expect, it } from 'vitest';
import { verificarInvariantes } from '../simulacion/invariantes.js';
import { aplicar } from './aplicar.js';
import { enumerarAcciones, ayuda } from './acciones.js';
import { crearPartida } from './crear.js';
import { decidir } from './decidir.js';
import { conCambios, mesaDePrueba } from './pruebas.js';
import type { Estado } from './tipos.js';

const mesa = mesaDePrueba({ jugadores: 3 });
const inicial = crearPartida(mesa, ['a', 'b', 'c']);
const [p, q, r] = inicial.jugadores.map((j) => j.id) as [string, string, string];
const principal = conCambios(inicial, { fase: 'FASE_PRINCIPAL', pasoPreparacion: 6, turnoDe: 0 });
const abandonar = (jugador: string) => ({ tipo: 'ABANDONAR' as const, jugador });

function aceptar(estado: Estado, jugador: string) {
  const resultado = aplicar(mesa, estado, abandonar(jugador));
  if (!resultado.ok) throw new Error(`rechazada: ${resultado.motivo}`);
  return resultado;
}

describe('ABANDONAR', () => {
  it('al empezar nadie ha abandonado', () => {
    expect(inicial.abandonados).toEqual([]);
  });

  it('registra el abandono en el estado y lo cuenta como evento', () => {
    const { estado, eventos } = aceptar(principal, q);
    expect(estado.abandonados).toEqual([q]);
    expect(eventos).toEqual([{ tipo: 'JUGADOR_ABANDONO', jugador: q }]);
  });

  it('se puede abandonar fuera de turno, que es cuando más se querría', () => {
    expect(principal.jugadores[principal.turnoDe]!.id).toBe(p);
    expect(aplicar(mesa, principal, abandonar(r)).ok).toBe(true);
  });

  it.each(['PREPARACION_POBLADO', 'PREPARACION_CAMINO', 'PRE_TIRADA', 'MOVER_LADRON'] as const)(
    'se puede abandonar en la fase %s',
    (fase) => {
      const estado = conCambios(inicial, { fase });
      expect(aplicar(mesa, estado, abandonar(q)).ok).toBe(true);
    },
  );

  it('se puede abandonar en pleno descarte, aunque no te toque descartar', () => {
    const estado = conCambios(principal, { fase: 'DESCARTE', descartesPendientes: { [p]: 3 } });
    expect(aplicar(mesa, estado, abandonar(r)).ok).toBe(true);
  });

  it('abandonar dos veces es inofensivo: la segunda no cambia nada', () => {
    const primera = aceptar(principal, q);
    const segunda = aceptar(primera.estado, q);
    expect(segunda.eventos).toEqual([]);
    expect(segunda.estado).toBe(primera.estado);
  });

  it('con tres jugadores, que uno abandone no termina la partida', () => {
    const { estado, eventos } = aceptar(principal, q);
    expect(estado.fase).toBe('FASE_PRINCIPAL');
    expect(estado.ganador).toBeNull();
    expect(eventos.some((e) => e.tipo === 'PARTIDA_GANADA')).toBe(false);
  });

  it('cuando solo queda uno sin abandonar, gana él por abandono', () => {
    const tras1 = aceptar(principal, q).estado;
    const { estado, eventos } = aceptar(tras1, r);

    expect(estado.fase).toBe('FIN');
    expect(estado.ganador).toBe(p);
    const gana = eventos.find((e) => e.tipo === 'PARTIDA_GANADA');
    expect(gana).toMatchObject({ jugador: p, porAbandono: true });
  });

  it('con dos jugadores, el que queda gana al instante', () => {
    const mesa2 = mesaDePrueba({ jugadores: 2 });
    const dos = conCambios(crearPartida(mesa2, ['x', 'y']), {
      fase: 'FASE_PRINCIPAL',
      pasoPreparacion: 4,
    });
    const [primero, segundo] = dos.jugadores.map((j) => j.id) as [string, string];
    const resultado = aplicar(mesa2, dos, abandonar(primero));
    if (!resultado.ok) throw new Error(resultado.motivo);
    expect(resultado.estado.ganador).toBe(segundo);
    expect(resultado.estado.fase).toBe('FIN');
  });

  it('ganar por abandono no exige haber llegado a los puntos de victoria', () => {
    const { estado } = aceptar(aceptar(principal, q).estado, r);
    expect(estado.config.puntosVictoria).toBeGreaterThan(0);
    expect(verificarInvariantes(mesa, estado)).toEqual([]);
  });

  it('no cuenta como victoria por abandono si alguien más sigue en juego', () => {
    // Un ganador normal sin que nadie abandone sigue exigiendo los puntos.
    const falso = conCambios(principal, { fase: 'FIN', ganador: p });
    expect(verificarInvariantes(mesa, falso).some((v) => v.startsWith('GANADOR_SIN_PUNTOS'))).toBe(
      true,
    );
  });

  it('un jugador que no existe se rechaza', () => {
    expect(decidir(mesa, principal, abandonar('zzz'))).toEqual({
      ok: false,
      motivo: 'JUGADOR_DESCONOCIDO',
    });
  });

  it('con la partida terminada ya no se puede abandonar', () => {
    const fin = aceptar(aceptar(principal, q).estado, r).estado;
    expect(decidir(mesa, fin, abandonar(p))).toEqual({ ok: false, motivo: 'PARTIDA_TERMINADA' });
  });

  it('no sale entre las jugadas legales ni en la ayuda: el bot y el piloto nunca lo eligen', () => {
    expect(enumerarAcciones(mesa, principal, p).some((a) => a.tipo === 'ABANDONAR')).toBe(false);
    expect(ayuda(mesa, principal, p).acciones.some((a) => a.tipo === 'ABANDONAR')).toBe(false);
  });
});
