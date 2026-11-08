import { describe, expect, it } from 'vitest';
import { crearPartida } from './crear.js';
import { decidir, manejadores } from './decidir.js';
import { conCambios, mesaDePrueba } from './pruebas.js';
import type { Accion } from './tipos.js';

const mesa = mesaDePrueba();
const base = crearPartida(mesa, ['a', 'b', 'c', 'd']);
const [j0, j1] = base.jugadores.map((j) => j.id) as [string, string];
const vertice = mesa.mapa.vertices[0]!.id;
const arista = mesa.mapa.aristas[0]!.id;

const accionesDe = (jugador: string): Accion[] => [
  { tipo: 'COLOCAR_POBLADO_INICIAL', jugador, vertice },
  { tipo: 'COLOCAR_CAMINO_INICIAL', jugador, arista },
  { tipo: 'TIRAR_DADOS', jugador },
  { tipo: 'DESCARTAR_RECURSOS', jugador, recursos: {} },
  { tipo: 'DESCARTE_AUTOMATICO', jugador },
  { tipo: 'MOVER_LADRON', jugador, destino: mesa.tablero.casillas[0]!.hex, victima: null },
  { tipo: 'SALTAR_TURNO_POR_INACTIVIDAD', jugador },
  { tipo: 'CONSTRUIR_CAMINO', jugador, arista },
  { tipo: 'CONSTRUIR_POBLADO', jugador, vertice },
  { tipo: 'CONSTRUIR_CIUDAD', jugador, vertice },
  { tipo: 'CAMBIAR_CON_BANCA', jugador, entrega: 'MADERA', recibe: 'TRIGO' },
  { tipo: 'PROPONER_TRATO', jugador, entrega: { MADERA: 1 }, pide: { TRIGO: 1 } },
  { tipo: 'ACEPTAR_TRATO', jugador, tratoId: 't1' },
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
  { tipo: 'JUGAR_CABALLERO', jugador, destino: mesa.tablero.casillas[0]!.hex, victima: null },
  { tipo: 'JUGAR_CONSTRUCCION_CARRETERAS', jugador, aristas: [arista] },
  { tipo: 'JUGAR_ABUNDANCIA', jugador, recursos: ['MADERA', 'TRIGO'] },
  { tipo: 'JUGAR_MONOPOLIO', jugador, recurso: 'TRIGO' },
  { tipo: 'PASAR_CONSTRUCCION_ESPECIAL', jugador },
  { tipo: 'TERMINAR_TURNO', jugador },
];

describe('decidir: comprobaciones generales', () => {
  it.each(accionesDe('nadie'))('id desconocido → JUGADOR_DESCONOCIDO ($tipo)', (accion) => {
    expect(decidir(mesa, base, accion)).toEqual({ ok: false, motivo: 'JUGADOR_DESCONOCIDO' });
  });

  it.each(accionesDe(j1))('jugador fuera de turno → NO_ES_TU_TURNO ($tipo)', (accion) => {
    expect(decidir(mesa, base, accion)).toEqual({ ok: false, motivo: 'NO_ES_TU_TURNO' });
  });

  describe('partida terminada', () => {
    const fin = conCambios(base, { fase: 'FIN', ganador: j0 });

    it.each([...accionesDe(j0), ...accionesDe(j1), ...accionesDe('nadie')])(
      'cualquier acción → PARTIDA_TERMINADA ($tipo de $jugador)',
      (accion) => {
        expect(decidir(mesa, fin, accion)).toEqual({ ok: false, motivo: 'PARTIDA_TERMINADA' });
      },
    );
  });

  it('todos los tipos de acción tienen manejador', () => {
    const tipos = accionesDe(j0).map((a) => a.tipo);
    expect(tipos).toHaveLength(23);
    // ABANDONAR tiene manejador pero no sale en la ayuda: no es una jugada que se ofrezca.
    expect(Object.keys(manejadores).toSorted()).toEqual([...tipos, 'ABANDONAR'].toSorted());
    for (const tipo of [...tipos, 'ABANDONAR' as const]) {
      expect(manejadores[tipo]).toBeTypeOf('function');
    }
  });

  describe('tipo de acción desconocido (core se puede llamar sin pasar por Zod)', () => {
    const principal = conCambios(base, { fase: 'FASE_PRINCIPAL', pasoPreparacion: 8 });

    it.each(['inventado', 'constructor', 'toString', '__proto__', 'hasOwnProperty'])(
      'tipo %j → FASE_INCORRECTA sin lanzar ni mutar',
      (tipo) => {
        const accion = { tipo, jugador: j0 } as unknown as Accion;
        for (const estado of [base, principal]) {
          const copia = structuredClone(estado);
          expect(decidir(mesa, estado, accion)).toEqual({ ok: false, motivo: 'FASE_INCORRECTA' });
          expect(estado).toEqual(copia);
        }
      },
    );

    it('los chequeos generales van antes: jugador fuera de turno → NO_ES_TU_TURNO', () => {
      const accion = { tipo: 'inventado', jugador: j1 } as unknown as Accion;
      expect(decidir(mesa, base, accion)).toEqual({ ok: false, motivo: 'NO_ES_TU_TURNO' });
    });
  });

  it('no muta el estado recibido', () => {
    const copia = structuredClone(base);
    decidir(mesa, base, { tipo: 'TIRAR_DADOS', jugador: j0 });
    decidir(mesa, base, { tipo: 'TIRAR_DADOS', jugador: 'nadie' });
    expect(base).toEqual(copia);
  });
});
