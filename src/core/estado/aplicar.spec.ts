import { describe, expect, it } from 'vitest';
import { COSTOS } from '../reglas/costos.js';
import { aplicar } from './aplicar.js';
import { crearPartida } from './crear.js';
import { conCambios, mesaDePrueba } from './pruebas.js';

const mesa = mesaDePrueba();
const base = crearPartida(mesa, ['a', 'b', 'c', 'd']);
const [j0, j1] = base.jugadores.map((j) => j.id) as [string, string];

describe('aplicar', () => {
  it('un rechazo se devuelve tal cual y el estado de entrada no cambia', () => {
    const copia = structuredClone(base);
    const resultado = aplicar(mesa, base, { tipo: 'TIRAR_DADOS', jugador: j1 });
    expect(resultado).toEqual({ ok: false, motivo: 'NO_ES_TU_TURNO' });
    expect(base).toEqual(copia);
  });

  it('con partida terminada rechaza aun a un jugador desconocido', () => {
    const fin = conCambios(base, { fase: 'FIN', ganador: j0 });
    expect(aplicar(mesa, fin, { tipo: 'TERMINAR_TURNO', jugador: 'nadie' })).toEqual({
      ok: false,
      motivo: 'PARTIDA_TERMINADA',
    });
  });

  it('integración: construir un camino devuelve el estado nuevo y sus eventos', () => {
    const arista = mesa.mapa.aristas[0]!;
    const [vertice] = arista.vertices;
    const estado = conCambios(base, {
      fase: 'FASE_PRINCIPAL',
      pasoPreparacion: 8,
      edificios: { [vertice]: { dueno: j0, tipo: 'POBLADO' } },
      // j0 juega primero (turnoDe 0): índice 0.
      jugadores: base.jugadores.with(0, {
        ...base.jugadores[0]!,
        recursos: { ...base.jugadores[0]!.recursos, MADERA: 2, LADRILLO: 1 },
      }),
    });
    const copia = structuredClone(estado);
    const resultado = aplicar(mesa, estado, {
      tipo: 'CONSTRUIR_CAMINO',
      jugador: j0,
      arista: arista.id,
    });

    expect(estado).toEqual(copia);
    expect(resultado).toEqual({
      ok: true,
      eventos: [
        {
          tipo: 'CAMINO_COLOCADO',
          jugador: j0,
          arista: arista.id,
          origen: 'CONSTRUCCION',
          costo: COSTOS.CAMINO,
        },
      ],
      estado: {
        ...estado,
        caminos: { [arista.id]: j0 },
        jugadores: estado.jugadores.map((j) =>
          j.id === j0
            ? {
                ...j,
                recursos: { ...j.recursos, MADERA: 1, LADRILLO: 0 },
                piezasRestantes: { ...j.piezasRestantes, caminos: j.piezasRestantes.caminos - 1 },
              }
            : j,
        ),
        banco: {
          ...estado.banco,
          MADERA: estado.banco.MADERA + 1,
          LADRILLO: estado.banco.LADRILLO + 1,
        },
        version: estado.version + 1,
      },
    });
  });
});
