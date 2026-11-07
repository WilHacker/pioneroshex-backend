import { describe, expect, it } from 'vitest';
import { crearGameConfig } from '../partida/game-config.js';
import { simularPartida } from '../simulacion/simular.js';
import { aMapaConfig, CATALOGO, infoDelMapa } from './catalogo.js';

const PUNTOS = 6;
const MAX_TURNOS = 250;

type Resultado = 'GANADOR' | 'ESTANCAMIENTO' | `FALLO: ${string}`;

/** Juega una partida completa de bots en el mapa, con jugadores a mitad de su rango recomendado. */
function jugar(entrada: (typeof CATALOGO)[number]): Resultado {
  const info = infoDelMapa(entrada);
  const jugadores = Math.round((info.minimoRecomendado + info.maximoRecomendado) / 2);
  const config = crearGameConfig({
    semillaMapa: `CAT-${entrada.id}`,
    semillaAzar: `#azar-${entrada.id}`,
    jugadores,
    puntosVictoria: PUNTOS,
    mapa: aMapaConfig(entrada),
  });
  const ids = Array.from({ length: jugadores }, (_, i) => `j${i}`);
  try {
    const { estado } = simularPartida(config, ids, {
      semillaBot: `bot-${entrada.id}`,
      maxTurnos: MAX_TURNOS,
    });
    return estado.ganador !== null ? 'GANADOR' : 'FALLO: sin ganador';
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    return mensaje.startsWith('estancamiento') ? 'ESTANCAMIENTO' : `FALLO: ${mensaje}`;
  }
}

describe('simulación en cada mapa del catálogo', () => {
  // Se acepta el estancamiento (como en el estrés del hexágono), nunca una violación de invariantes.
  it.each(CATALOGO.map((m) => [m.id, m] as const))(
    '«%s»: la partida termina con ganador o por estancamiento',
    { timeout: 240_000 },
    (_id, entrada) => {
      expect(jugar(entrada)).not.toMatch(/^FALLO/);
    },
  );
});
