import { describe, expect, it } from 'vitest';
import { crearGameConfig } from '../partida/game-config.js';
import { simularPartida } from './simular.js';

const PUNTOS = 6;
const MAX_TURNOS = 400;

const ids = (n: number) => Array.from({ length: n }, (_, i) => `j${i}`);

function jugar(jugadores: number, modo: 'A' | 'B', semilla: string): string {
  const config = crearGameConfig({
    semillaMapa: `DOCE-${semilla}`,
    semillaAzar: `#azar-${semilla}`,
    jugadores,
    turnRuleMode: modo,
    puntosVictoria: PUNTOS,
  });
  try {
    const { estado } = simularPartida(config, ids(jugadores), {
      semillaBot: `bot-${semilla}`,
      maxTurnos: MAX_TURNOS,
    });
    return estado.ganador !== null ? 'GANADOR' : `FALLO ${semilla}: sin ganador`;
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    return mensaje.startsWith('estancamiento') ? 'ESTANCAMIENTO' : `FALLO ${semilla}: ${mensaje}`;
  }
}

describe('simulación con 11 y 12 jugadores (mapa de radio 4 por defecto)', () => {
  const casos = [11, 12].flatMap((n) =>
    (['A', 'B'] as const).flatMap((modo) =>
      ['x', 'y'].map((s) => ({ n, modo, semilla: `${n}${modo}${s}` })),
    ),
  );

  it.each(casos)(
    '$n jugadores, modo $modo, semilla $semilla: termina o se estanca, sin violar invariantes',
    { timeout: 240_000 },
    ({ n, modo, semilla }) => {
      expect(jugar(n, modo, semilla)).not.toMatch(/^FALLO/);
    },
  );
});
