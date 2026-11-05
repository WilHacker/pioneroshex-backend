import { describe, expect, it } from 'vitest';
import { crearPartidaNueva } from './partida-nueva.js';

const IDS = ['ana', 'beto', 'caro'];

describe('crearPartidaNueva', () => {
  it('crea la mesa y el estado inicial con las dos semillas independientes', () => {
    const { mesa, estado } = crearPartidaNueva(IDS);
    expect(estado.jugadores.map((j) => j.id).toSorted()).toEqual([...IDS].toSorted());
    expect(estado.config.jugadores).toBe(3);
    expect(mesa.config).toBe(estado.config);
    expect(estado.config.semillaAzar.startsWith(estado.config.semillaMapa)).toBe(false);
  });

  it('la semillaAzar sale de un generador seguro: 32 caracteres hex, distinta cada vez', () => {
    const a = crearPartidaNueva(IDS).estado.config;
    const b = crearPartidaNueva(IDS).estado.config;
    expect(a.semillaAzar).toMatch(/^[0-9a-f]{32}$/);
    expect(a.semillaAzar).not.toBe(b.semillaAzar);
    expect(a.semillaMapa).not.toBe(b.semillaMapa);
  });

  it('respeta la semillaMapa que fija el anfitrión (es pública y compartible)', () => {
    const { estado } = crearPartidaNueva(IDS, { semillaMapa: 'ANDES-2026' });
    expect(estado.config.semillaMapa).toBe('ANDES-2026');
    expect(estado.config.semillaAzar).not.toContain('ANDES-2026');
  });

  it('pasa al motor las opciones del anfitrión (puntos de victoria, modo de turnos...)', () => {
    const { estado } = crearPartidaNueva(IDS, { puntosVictoria: 6 });
    expect(estado.config.puntosVictoria).toBe(6);
  });

  it('con un generador inyectado es determinista (para probar)', () => {
    const semillas = ['mapa-fija', 'azar-secreta'];
    const { estado } = crearPartidaNueva(IDS, {}, () => semillas.shift()!);
    expect(estado.config.semillaMapa).toBe('mapa-fija');
    expect(estado.config.semillaAzar).toBe('azar-secreta');
  });

  it('rechaza un generador que repite la semilla (la vista pública revelaría la secreta)', () => {
    expect(() => crearPartidaNueva(IDS, {}, () => 'igual')).toThrow(/independiente/);
  });

  it('rechaza jugadores repetidos o un número fuera de rango', () => {
    expect(() => crearPartidaNueva(['a', 'a', 'b'])).toThrow();
    expect(() => crearPartidaNueva(['solo'])).toThrow(/jugadores/);
  });
});
