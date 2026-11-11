import { describe, expect, it } from 'vitest';
import { crearGameConfig } from '../partida/game-config.js';
import { aplicar } from './aplicar.js';
import { crearPartida } from './crear.js';
import { decidir } from './decidir.js';
import { paso } from './paso.js';
import { conCambios, mesaDePrueba } from './pruebas.js';
import type { Accion, Estado, JugadorId } from './tipos.js';
import { vistaPara } from './vista.js';

type Modo = 'LIBRE' | 'PRIVADO' | 'SOLO_BANCO';

function partida(modoComercio: Modo = 'LIBRE', maxOfertasPorTurno = 0) {
  const mesa = mesaDePrueba({ jugadores: 4, modoComercio, maxOfertasPorTurno });
  const inicial = crearPartida(mesa, ['a', 'b', 'c', 'd']);
  const [yo, b, c, d] = inicial.jugadores.map((j) => j.id) as [
    JugadorId,
    JugadorId,
    JugadorId,
    JugadorId,
  ];
  const estado = conCambios(inicial, {
    fase: 'FASE_PRINCIPAL',
    pasoPreparacion: 8,
    turnoDe: 0,
    jugadores: inicial.jugadores.map((j) => ({
      ...j,
      recursos: { MADERA: 4, LADRILLO: 4, OVEJA: 4, TRIGO: 4, MINERAL: 4 },
    })),
  });
  const proponer = (
    destinatario: JugadorId | null,
    dar = 'MADERA',
    pedir = 'LADRILLO',
  ): Accion => ({
    tipo: 'PROPONER_TRATO',
    jugador: yo,
    entrega: { [dar]: 1 },
    pide: { [pedir]: 1 },
    destinatario,
  });
  return { mesa, estado, yo, b, c, d, proponer };
}

function aceptar(mesa: ReturnType<typeof partida>['mesa'], estado: Estado, accion: Accion): Estado {
  const r = aplicar(mesa, estado, accion);
  if (!r.ok) throw new Error(`rechazada: ${r.motivo}`);
  return r.estado;
}

describe('GameConfig: modoComercio y maxOfertasPorTurno', () => {
  it('por defecto el comercio es libre y sin tope de ofertas', () => {
    const { config } = mesaDePrueba();
    expect(config.modoComercio).toBe('LIBRE');
    expect(config.maxOfertasPorTurno).toBe(0);
  });

  it.each(['LIBRE', 'PRIVADO', 'SOLO_BANCO'] as const)('acepta el modo %s', (modoComercio) => {
    expect(mesaDePrueba({ modoComercio }).config.modoComercio).toBe(modoComercio);
  });

  it('rechaza un modo que no existe y un tope que no es un entero entre 0 y 20', () => {
    const base = { semillaMapa: 'm', semillaAzar: 'azar-secreto' };
    expect(() => crearGameConfig({ ...base, modoComercio: 'LIBRO' as never })).toThrow(
      /modoComercio/,
    );
    for (const maxOfertasPorTurno of [-1, 1.5, 21, Number.NaN]) {
      expect(() => crearGameConfig({ ...base, maxOfertasPorTurno })).toThrow(/maxOfertasPorTurno/);
    }
  });
});

describe('Comercio solo con el banco', () => {
  it('no se pueden proponer tratos a los jugadores', () => {
    const { mesa, estado, proponer, b } = partida('SOLO_BANCO');
    expect(decidir(mesa, estado, proponer(null))).toEqual({
      ok: false,
      motivo: 'NO_PUEDES_COMERCIAR',
    });
    expect(decidir(mesa, estado, proponer(b))).toEqual({
      ok: false,
      motivo: 'NO_PUEDES_COMERCIAR',
    });
  });

  it('el comercio con el banco sigue funcionando', () => {
    const { mesa, estado, yo } = partida('SOLO_BANCO');
    const r = decidir(mesa, estado, {
      tipo: 'CAMBIAR_CON_BANCA',
      jugador: yo,
      entrega: { MADERA: 4 },
      recibe: { OVEJA: 1 },
    });
    expect(r.ok).toBe(true);
  });

  it('las cartas de desarrollo no se ven afectadas: el monopolio sigue robando', () => {
    const { mesa, estado, yo } = partida('SOLO_BANCO');
    const conCarta = conCambios(estado, {
      jugadores: estado.jugadores.map((j) =>
        j.id === yo ? { ...j, cartasDesarrollo: ['MONOPOLIO'] } : j,
      ),
    });
    expect(
      decidir(mesa, conCarta, { tipo: 'JUGAR_MONOPOLIO', jugador: yo, recurso: 'MADERA' }).ok,
    ).toBe(true);
  });
});

describe('Comercio privado', () => {
  it('toda oferta debe ir dirigida a un jugador concreto', () => {
    const { mesa, estado, proponer, b } = partida('PRIVADO');
    expect(decidir(mesa, estado, proponer(null))).toEqual({
      ok: false,
      motivo: 'DESTINATARIO_INVALIDO',
    });
    expect(decidir(mesa, estado, proponer(b)).ok).toBe(true);
  });

  it('en el comercio libre, una oferta abierta sigue valiendo', () => {
    const { mesa, estado, proponer } = partida('LIBRE');
    expect(decidir(mesa, estado, proponer(null)).ok).toBe(true);
  });

  it('solo el proponente y el destinatario ven la oferta en el estado', () => {
    const { mesa, estado, proponer, yo, b, c } = partida('PRIVADO');
    const con = aceptar(mesa, estado, proponer(b));
    expect(vistaPara(con, yo).tratos).toHaveLength(1);
    expect(vistaPara(con, b).tratos).toHaveLength(1);
    expect(vistaPara(con, c).tratos).toEqual([]);
    expect(vistaPara(con, null).tratos).toEqual([]);
  });

  it('en el comercio libre todos ven la oferta', () => {
    const { mesa, estado, proponer, c } = partida('LIBRE');
    const con = aceptar(mesa, estado, proponer(null));
    expect(vistaPara(con, c).tratos).toHaveLength(1);
  });

  it('una contraoferta también es privada: solo la ven quien la hace y el proponente original', () => {
    const { mesa, estado, proponer, yo, b, c } = partida('PRIVADO');
    const oferta = aceptar(mesa, estado, proponer(b));
    const id = oferta.tratos[0]!.id;
    const contra = aceptar(mesa, oferta, {
      tipo: 'CONTRAOFERTAR_TRATO',
      jugador: b,
      tratoIdOriginal: id,
      entrega: { LADRILLO: 2 },
      pide: { MADERA: 1 },
    });
    expect(vistaPara(contra, c).tratos).toEqual([]);
    expect(vistaPara(contra, yo).tratos.some((t) => t.proponente === b)).toBe(true);
  });

  describe('lo que se cuenta a los demás (eventos y notificaciones)', () => {
    it('los ajenos no reciben el evento de la oferta, los implicados sí', () => {
      const { mesa, estado, proponer, yo, b, c, d } = partida('PRIVADO');
      const r = paso(mesa, estado, proponer(b), [yo, b, c, d, null]);
      if (!r.ok) throw new Error(r.motivo);
      const tipos = (obs: JugadorId | null) =>
        r.notificaciones.find((n) => n.observador === obs)!.eventos.map((e) => e.tipo);
      expect(tipos(yo)).toContain('TRATO_PROPUESTO');
      expect(tipos(b)).toContain('TRATO_PROPUESTO');
      expect(tipos(c)).not.toContain('TRATO_PROPUESTO');
      expect(tipos(d)).not.toContain('TRATO_PROPUESTO');
      expect(tipos(null)).not.toContain('TRATO_PROPUESTO');
    });

    it('lo mismo con aceptar, rechazar y cancelar: los ajenos no se enteran', () => {
      const { mesa, estado, proponer, yo, b, c } = partida('PRIVADO');
      const oferta = aceptar(mesa, estado, proponer(b));
      const id = oferta.tratos[0]!.id;
      const casos: { accion: Accion; evento: string }[] = [
        { accion: { tipo: 'ACEPTAR_TRATO', jugador: b, tratoId: id }, evento: 'TRATO_ACEPTADO' },
        { accion: { tipo: 'RECHAZAR_TRATO', jugador: b, tratoId: id }, evento: 'TRATO_RECHAZADO' },
        { accion: { tipo: 'CANCELAR_TRATO', jugador: yo, tratoId: id }, evento: 'TRATO_CANCELADO' },
      ];
      for (const { accion, evento } of casos) {
        const r = paso(mesa, oferta, accion, [yo, b, c]);
        if (!r.ok) throw new Error(r.motivo);
        const de = (obs: JugadorId) =>
          r.notificaciones.find((n) => n.observador === obs)!.eventos.map((e) => e.tipo);
        expect(de(yo)).toContain(evento);
        expect(de(b)).toContain(evento);
        expect(de(c)).not.toContain(evento);
      }
    });

    it('en el comercio libre todos ven los eventos de los tratos', () => {
      const { mesa, estado, proponer, yo, b, c } = partida('LIBRE');
      const r = paso(mesa, estado, proponer(null), [yo, b, c]);
      if (!r.ok) throw new Error(r.motivo);
      for (const obs of [yo, b, c]) {
        expect(
          r.notificaciones.find((n) => n.observador === obs)!.eventos.map((e) => e.tipo),
        ).toContain('TRATO_PROPUESTO');
      }
    });
  });
});

describe('Tope de ofertas por turno', () => {
  it('sin tope se pueden hacer todas las ofertas que se quiera', () => {
    const { mesa, estado, proponer, b } = partida('LIBRE', 0);
    let actual = estado;
    for (let i = 0; i < 6; i++) actual = aceptar(mesa, actual, proponer(b));
    expect(actual.ofertasEsteTurno).toBe(6);
  });

  it('con tope 2, la tercera oferta del turno se rechaza', () => {
    const { mesa, estado, proponer, b } = partida('LIBRE', 2);
    let actual = aceptar(mesa, estado, proponer(b));
    actual = aceptar(mesa, actual, proponer(b));
    expect(decidir(mesa, actual, proponer(b))).toEqual({ ok: false, motivo: 'DEMASIADAS_OFERTAS' });
  });

  it('cancelar una oferta no devuelve el intento: el tope cuenta las propuestas hechas', () => {
    const { mesa, estado, proponer, yo, b } = partida('LIBRE', 1);
    const una = aceptar(mesa, estado, proponer(b));
    const sin = aceptar(mesa, una, {
      tipo: 'CANCELAR_TRATO',
      jugador: yo,
      tratoId: una.tratos[0]!.id,
    });
    expect(decidir(mesa, sin, proponer(b))).toEqual({ ok: false, motivo: 'DEMASIADAS_OFERTAS' });
  });

  it('las contraofertas de los rivales no gastan el tope de quien tiene el turno', () => {
    const { mesa, estado, proponer, b } = partida('LIBRE', 2);
    const oferta = aceptar(mesa, estado, proponer(null));
    const conContra = aceptar(mesa, oferta, {
      tipo: 'CONTRAOFERTAR_TRATO',
      jugador: b,
      tratoIdOriginal: oferta.tratos[0]!.id,
      entrega: { LADRILLO: 1 },
      pide: { MADERA: 1 },
    });
    expect(conContra.ofertasEsteTurno).toBe(1);
    expect(decidir(mesa, conContra, proponer(b)).ok).toBe(true);
  });

  it('el tope se reinicia al terminar el turno', () => {
    const { mesa, estado, proponer, yo, b } = partida('LIBRE', 1);
    const una = aceptar(mesa, estado, proponer(b));
    expect(decidir(mesa, una, proponer(b)).ok).toBe(false);
    const siguiente = aceptar(mesa, una, { tipo: 'TERMINAR_TURNO', jugador: yo });
    expect(siguiente.ofertasEsteTurno).toBe(0);
  });

  it('el comercio con el banco no cuenta como oferta', () => {
    const { mesa, estado, yo, proponer, b } = partida('LIBRE', 1);
    const tras = aceptar(mesa, estado, {
      tipo: 'CAMBIAR_CON_BANCA',
      jugador: yo,
      entrega: { MADERA: 4 },
      recibe: { OVEJA: 1 },
    });
    expect(decidir(mesa, tras, proponer(b, 'LADRILLO', 'TRIGO')).ok).toBe(true);
  });
});
