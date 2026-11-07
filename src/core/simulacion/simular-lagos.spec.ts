import { describe, expect, it } from 'vitest';
import { casillasPorRadio } from '../mapa/coordenadas.js';
import { crearGameConfig } from '../partida/game-config.js';
import { simularPartida } from './simular.js';

/** Radio 3 con dos lagos de una casilla que no se tocan (35 casillas). */
const DOS_LAGOS = casillasPorRadio(3)
  .filter((c) => !(c.q === -1 && c.r === 1) && !(c.q === 1 && c.r === -1))
  .map((c): [number, number] => [c.q, c.r]);

const ids = (n: number) => Array.from({ length: n }, (_, i) => `j${i}`);

function jugar(semilla: string): string {
  const config = crearGameConfig({
    semillaMapa: `LAGOS-${semilla}`,
    semillaAzar: `#azar-${semilla}`,
    jugadores: 6,
    mapa: { nombre: 'Dos lagos', casillas: DOS_LAGOS },
  });
  try {
    const { estado } = simularPartida(config, ids(6), {
      semillaBot: `bot-${semilla}`,
      maxTurnos: 300,
    });
    return estado.ganador !== null ? 'GANADOR' : `FALLO ${semilla}: sin ganador`;
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    return mensaje.startsWith('estancamiento') ? 'ESTANCAMIENTO' : `FALLO ${semilla}: ${mensaje}`;
  }
}

describe('simulación en un mapa con lagos', () => {
  it(
    'las partidas terminan con ganador o por estancamiento, nunca violan invariantes',
    { timeout: 180_000 },
    () => {
      const resultados = ['a', 'b', 'c', 'd', 'e', 'f'].map(jugar);
      expect(resultados.filter((r) => r.startsWith('FALLO'))).toEqual([]);
      expect(resultados).toHaveLength(6);
    },
  );
});
