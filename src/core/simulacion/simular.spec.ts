import { beforeAll, describe, expect, it } from 'vitest';
import { aplicar } from '../estado/aplicar.js';
import { crearMesa } from '../estado/mesa.js';
import { puntosDe } from '../estado/puntos.js';
import type { Accion, Estado } from '../estado/tipos.js';
import { crearGameConfig, type GameConfig } from '../partida/game-config.js';
import { verificarInvariantes } from './invariantes.js';
import { reproducir, simularPartida } from './simular.js';

const MAX_TURNOS = 300;
/*
 * Con las reglas de la Fase 1 (sin comercio, ni 4:1 con el banco, y el 7 sin efecto) el banco
 * acaba vacío en manos que no pueden gastarlo y muchas partidas se bloquean sin remedio: a 10
 * puntos casi ninguna termina. Hasta que lleguen el comercio y el ladrón, el simulador juega a
 * PUNTOS puntos y con semillas comprobadas que terminan (las que no, se estancan: ver el informe).
 */
const PUNTOS = 4;
const SEMILLAS_3 = [0, 1, 2, 3, 5, 7, 8, 9, 10, 12, 14, 16, 17, 18, 20, 21, 22, 23, 24, 25];
const idsDe = (n: number) => Array.from({ length: n }, (_, i) => `j${i}`);

function comprobarFinal(config: GameConfig, estado: Estado): void {
  expect(estado.fase).toBe('FIN');
  expect(estado.ganador).not.toBeNull();
  expect(puntosDe(estado, estado.ganador!)).toBeGreaterThanOrEqual(config.puntosVictoria);
  expect(verificarInvariantes(crearMesa(config), estado)).toEqual([]);
}

function simular3(semilla: string, maxTurnos = MAX_TURNOS) {
  const config = crearGameConfig({ semilla, jugadores: 3, puntosVictoria: PUNTOS });
  return {
    config,
    ...simularPartida(config, idsDe(3), { semillaBot: `bot-${semilla}`, maxTurnos }),
  };
}

describe('simularPartida', () => {
  it.each(SEMILLAS_3.map((i) => `sim-${i}`))(
    '3 jugadores, radio 2, semilla %s: termina con ganador y sin violaciones',
    { timeout: 5000 },
    (semilla) => {
      const { config, estado } = simular3(semilla);
      comprobarFinal(config, estado);
    },
  );

  it.each([
    { jugadores: 2, semilla: 'dos-1' },
    { jugadores: 2, semilla: 'dos-2' },
    { jugadores: 10, semilla: 'diez-0' },
    // 6 jugadores juegan el tramo de piezas de 5–6 (20 caminos, 7 poblados, 5 ciudades) en radio 3.
    // Semilla elegida probando `seis-0`…`seis-14` a 4 puntos y 300 turnos: `seis-0` es la primera
    // que termina (13 de 15 terminan; `seis-6` y `seis-7` se estancan, esperable sin comercio).
    { jugadores: 6, semilla: 'seis-0' },
  ])('$jugadores jugadores ($semilla) también terminan', { timeout: 10000 }, (caso) => {
    const config = crearGameConfig({ ...caso, puntosVictoria: PUNTOS });
    expect(config.radio).toBe(caso.jugadores > 4 ? 3 : 2);
    const { estado } = simularPartida(config, idsDe(caso.jugadores), {
      semillaBot: `bot-${caso.semilla}`,
      maxTurnos: MAX_TURNOS,
    });
    comprobarFinal(config, estado);
  });

  it(
    'simula una partida en Modo B con 5 jugadores y fase especial de construcción',
    { timeout: 15000 },
    () => {
      const config = crearGameConfig({
        semilla: 'seis-0',
        jugadores: 5,
        turnRuleMode: 'B',
        puntosVictoria: PUNTOS,
      });
      const { estado } = simularPartida(config, idsDe(5), {
        semillaBot: 'bot-modo-b',
        maxTurnos: MAX_TURNOS,
      });
      comprobarFinal(config, estado);
    },
  );

  it('turnos = tiradas: maxTurnos igual a los turnos jugados no lanza, uno menos sí', () => {
    const { turnos, estado } = simular3('sim-0');
    expect(turnos).toBe(estado.tiradas);
    expect(simular3('sim-0', turnos).turnos).toBe(turnos);
    expect(() => simular3('sim-0', turnos - 1)).toThrow(/estancamiento/);
  });

  it('lanza estancamiento si un turno pasa de maxAccionesPorTurno', () => {
    const config = crearGameConfig({ semilla: 'sim-0', jugadores: 3, puntosVictoria: PUNTOS });
    // La preparación de 3 jugadores son 12 acciones dentro del turno 0.
    const opciones = { semillaBot: 'b', maxTurnos: MAX_TURNOS, maxAccionesPorTurno: 5 };
    expect(() => simularPartida(config, idsDe(3), opciones)).toThrow(
      /estancamiento: más de 5 acciones/,
    );
  });

  it('lanza estancamiento si pasa de maxTurnos', () => {
    const config = crearGameConfig({ semilla: 'sim-0', jugadores: 3, puntosVictoria: PUNTOS });
    expect(() => simularPartida(config, idsDe(3), { semillaBot: 'b', maxTurnos: 3 })).toThrow(
      /estancamiento/,
    );
  });
});

describe('repetición', () => {
  const config = crearGameConfig({ semilla: 'sim-1', jugadores: 3, puntosVictoria: PUNTOS });
  const ids = idsDe(3);
  let estado: Estado;
  let acciones: readonly Accion[];
  beforeAll(() => {
    ({ estado, acciones } = simularPartida(config, ids, {
      semillaBot: 'bot-sim-1',
      maxTurnos: MAX_TURNOS,
    }));
  });

  it('reproducir las acciones da el mismo estado final', { timeout: 5000 }, () => {
    expect(reproducir(config, ids, acciones)).toEqual(estado);
  });

  it('pasar el estado por JSON a mitad de partida no cambia el final', { timeout: 5000 }, () => {
    const mitad = Math.floor(acciones.length / 2);
    const intermedio = reproducir(config, ids, acciones.slice(0, mitad));
    const mesa = crearMesa(config);
    const final = acciones.slice(mitad).reduce(
      (e: Estado, accion) => {
        const resultado = aplicar(mesa, e, accion);
        if (!resultado.ok) throw new Error(resultado.motivo);
        return resultado.estado;
      },
      JSON.parse(JSON.stringify(intermedio)) as Estado,
    );
    expect(final).toEqual(estado);
  });

  it('reproducir lanza si una acción se rechaza', () => {
    expect(() =>
      reproducir(config, ids, [{ tipo: 'TIRAR_DADOS', jugador: acciones[0]!.jugador }]),
    ).toThrow(/FASE_INCORRECTA/);
  });
});

/*
 * Estrés sin sesgo de supervivencia: semillas arbitrarias a 10 puntos. Se acepta el estancamiento
 * (esperable en la Fase 1, sin comercio), pero nunca una violación de invariantes ni otro error.
 */
const casos = (jugadores: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ jugadores, semilla: `estres-${jugadores}-${i}` }));
const CASOS = [...casos(2, 10), ...casos(3, 15), ...casos(4, 10), ...casos(6, 5), ...casos(10, 3)];

function jugar({ jugadores, semilla }: { jugadores: number; semilla: string }): string {
  const config = crearGameConfig({ semilla, jugadores });
  try {
    const { estado } = simularPartida(config, idsDe(jugadores), {
      semillaBot: `bot-${semilla}`,
      maxTurnos: 150,
    });
    return estado.ganador !== null ? 'GANADOR' : `FALLO ${semilla}: sin ganador`;
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    return mensaje.startsWith('estancamiento') ? 'ESTANCAMIENTO' : `FALLO ${semilla}: ${mensaje}`;
  }
}

describe('estrés con semillas arbitrarias', () => {
  it(
    'cada partida termina con ganador o por estancamiento, nunca con violaciones',
    { timeout: 60000 },
    () => {
      const resultados = CASOS.map(jugar);
      expect(resultados.filter((r) => r.startsWith('FALLO'))).toEqual([]);
      expect(resultados).toHaveLength(43);
    },
  );
});
