import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Estado } from '../../core/estado/tipos.js';
import { PartidaActor } from './partida-actor.js';
import { crearPartidaNueva } from './partida-nueva.js';

const LIMITE_MS = 30_000;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Una partida de tres jugadores ya fuera de la preparación, en la fase pedida. */
function crear(
  cambios: Partial<Estado> = {},
  limiteTurnoMs: number | undefined = LIMITE_MS,
): { actor: PartidaActor; cambiados: Estado[] } {
  const { mesa, estado } = crearPartidaNueva(['j1', 'j2', 'j3'], { semillaMapa: 'reloj' });
  const cambiados: Estado[] = [];
  const base: Estado = {
    ...estado,
    fase: 'PRE_TIRADA',
    pasoPreparacion: 6,
    turnoDe: 0,
    ...cambios,
  };
  const actor = new PartidaActor(mesa, base, {
    limiteTurnoMs,
    alCambiar: (nuevo) => void cambiados.push(nuevo),
  });
  return { actor, cambiados };
}

describe('PartidaActor: reloj de turno', () => {
  it('si el jugador no hace nada, al vencer el tiempo se juega por él con causa de inactividad', async () => {
    const { actor, cambiados } = crear();

    await vi.advanceTimersByTimeAsync(LIMITE_MS + 1);

    // Tiró los dados por él (con un 7 la fase sería otra, por eso solo se mira que salió de PRE_TIRADA).
    expect(cambiados).toHaveLength(1);
    expect(actor.estado.fase).not.toBe('PRE_TIRADA');
    expect(actor.estado.dados).not.toBeNull();
  });

  it('cada jugada aceptada reinicia el tiempo completo', async () => {
    const { actor, cambiados } = crear({ fase: 'FASE_PRINCIPAL' });
    await vi.advanceTimersByTimeAsync(LIMITE_MS - 1_000);
    // El orden de turno se baraja: quien juega primero no tiene por qué ser j1.
    const primero = actor.estado.jugadores[0]!.id;
    await actor.enviar({ tipo: 'TERMINAR_TURNO', jugador: primero });
    expect(cambiados).toHaveLength(1);
    expect(actor.estado.turnoDe).toBe(1);

    // Faltaba 1 s para vencer, pero la jugada reinició el reloj: j2 tiene su tiempo completo.
    await vi.advanceTimersByTimeAsync(LIMITE_MS - 1_000);
    expect(cambiados).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(cambiados).toHaveLength(2);
    expect(actor.estado.dados).not.toBeNull();
  });

  it('en la fase principal vence terminando el turno, y el siguiente jugador tiene su tiempo', async () => {
    const { actor } = crear({ fase: 'FASE_PRINCIPAL' });

    await vi.advanceTimersByTimeAsync(LIMITE_MS + 1);

    expect(actor.estado.turnoDe).toBe(1);
    expect(actor.estado.fase).toBe('PRE_TIRADA');
    // El tiempo completo, salvo el milisegundo que avanzó el reloj simulado tras vencer.
    expect(actor.restanteMs).toBeGreaterThan(LIMITE_MS - 10);
    expect(actor.restanteMs).toBeLessThanOrEqual(LIMITE_MS);
  });

  it('con descartes pendientes descarta solo a quienes deben, sin quitarle nada a los demás', async () => {
    const base = crear().actor.estado;
    // El orden de turno se baraja: se localiza a cada jugador por su id, no por su posición.
    const conMadera = (id: string, n: number) => (j: (typeof base.jugadores)[number]) =>
      j.id === id ? { ...j, recursos: { ...j.recursos, MADERA: n } } : j;
    const { actor } = crear({
      fase: 'DESCARTE',
      descartesPendientes: { j2: 4 },
      jugadores: base.jugadores.map(conMadera('j2', 8)).map(conMadera('j3', 3)),
    });

    await vi.advanceTimersByTimeAsync(LIMITE_MS + 1);

    const madera = (id: string) => actor.estado.jugadores.find((j) => j.id === id)!.recursos.MADERA;
    expect(actor.estado.descartesPendientes).toEqual({});
    expect(madera('j2')).toBe(4);
    expect(madera('j3')).toBe(3);
  });

  it('sin límite configurado no hay reloj ni cuenta atrás', async () => {
    const { actor, cambiados } = crear({}, 0);

    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(cambiados).toHaveLength(0);
    expect(actor.restanteMs).toBeNull();
  });

  it('en la preparación y al terminar no corre el reloj', async () => {
    const preparando = crear({ fase: 'PREPARACION_POBLADO', pasoPreparacion: 0 });
    const terminada = crear({ fase: 'FIN', ganador: 'j1' });

    await vi.advanceTimersByTimeAsync(LIMITE_MS * 3);

    expect(preparando.cambiados).toHaveLength(0);
    expect(terminada.cambiados).toHaveLength(0);
    expect(preparando.actor.restanteMs).toBeNull();
    expect(terminada.actor.restanteMs).toBeNull();
  });

  it('cuenta atrás: restanteMs baja con el tiempo y es lo que llega a los clientes', async () => {
    const { actor } = crear();

    expect(actor.restanteMs).toBe(LIMITE_MS);
    await vi.advanceTimersByTimeAsync(12_000);

    expect(actor.restanteMs).toBe(LIMITE_MS - 12_000);
  });

  it('detener apaga el reloj para siempre', async () => {
    const { actor, cambiados } = crear();

    actor.detener();
    await vi.advanceTimersByTimeAsync(LIMITE_MS * 2);

    expect(cambiados).toHaveLength(0);
    expect(actor.restanteMs).toBeNull();
  });

  it('un fallo al jugar por inactividad se registra y no tira el proceso', async () => {
    const { actor } = crear({ fase: 'PRE_TIRADA', turnoDe: 99 });

    await vi.advanceTimersByTimeAsync(LIMITE_MS + 1);

    expect(actor.estado.fase).toBe('PRE_TIRADA');
  });
});
