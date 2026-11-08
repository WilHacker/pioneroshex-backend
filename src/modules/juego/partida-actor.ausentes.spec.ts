import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Estado } from '../../core/estado/tipos.js';
import { PartidaActor, type Presencia } from './partida-actor.js';
import { crearPartidaNueva } from './partida-nueva.js';

const GRACIA_MS = 60_000;
const RITMO_MS = 1_000;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

interface Ctx {
  actor: PartidaActor;
  /** Ids en el orden de turno. */
  ids: string[];
}

/** Tres jugadores sin límite de turno; por defecto ya fuera de la preparación y en PRE_TIRADA. */
function crear(cambios: Partial<Estado> | null = {}): Ctx {
  const { mesa, estado } = crearPartidaNueva(['j1', 'j2', 'j3'], { semillaMapa: 'ausentes' });
  const base: Estado =
    cambios === null
      ? estado
      : { ...estado, fase: 'PRE_TIRADA', pasoPreparacion: 6, turnoDe: 0, ...cambios };
  const actor = new PartidaActor(mesa, base, {
    graciaAusenteMs: GRACIA_MS,
    ritmoPilotoMs: RITMO_MS,
  });
  return { actor, ids: base.jugadores.map((j) => j.id) };
}

const conectar = (actor: PartidaActor, id: string) => actor.suscribir(id, () => undefined);

describe('PartidaActor: quién está conectado', () => {
  it('al empezar nadie lo está; suscribirse conecta y darse de baja desconecta', () => {
    const { actor, ids } = crear();
    expect(actor.presencia().conectados).toEqual([]);

    const baja = conectar(actor, ids[0]!);
    expect(actor.presencia().conectados).toEqual([ids[0]]);

    baja();
    expect(actor.presencia().conectados).toEqual([]);
  });

  it('con dos pestañas abiertas sigue conectado hasta cerrar la última', () => {
    const { actor, ids } = crear();
    const a = conectar(actor, ids[0]!);
    const b = conectar(actor, ids[0]!);
    a();
    expect(actor.presencia().conectados).toEqual([ids[0]]);
    b();
    expect(actor.presencia().conectados).toEqual([]);
  });

  it('avisa a quien escucha la presencia cuando alguien entra o sale, y no después de darse de baja', () => {
    const { actor, ids } = crear();
    const avisos: Presencia[] = [];
    const bajaOyente = actor.alCambiarPresencia((p) => avisos.push(p));

    const baja = conectar(actor, ids[1]!);
    baja();
    expect(avisos.map((p) => p.conectados)).toEqual([[ids[1]], []]);

    bajaOyente();
    conectar(actor, ids[2]!);
    expect(avisos).toHaveLength(2);
  });

  it('una segunda pestaña del mismo jugador no cambia la presencia: no hay aviso repetido', () => {
    const { actor, ids } = crear();
    conectar(actor, ids[0]!);
    const avisos: Presencia[] = [];
    actor.alCambiarPresencia((p) => avisos.push(p));
    conectar(actor, ids[0]!);
    expect(avisos).toEqual([]);
  });
});

describe('PartidaActor: piloto automático', () => {
  it('si le toca a alguien desconectado y otro espera, pasada la gracia se juega por él', async () => {
    const { actor, ids } = crear();
    conectar(actor, ids[2]!); // alguien espera; al que le toca (ids[0]) no está

    await vi.advanceTimersByTimeAsync(GRACIA_MS - 1_000);
    expect(actor.estado.dados).toBeNull();

    // Medio segundo después: ya tiró los dados, y aún no pasó el ritmo de la siguiente jugada.
    await vi.advanceTimersByTimeAsync(1_500);
    expect(actor.estado.dados).not.toBeNull();
    expect(actor.estado.fase).not.toBe('PRE_TIRADA');
  });

  it('si el jugador vuelve antes de la gracia, no se juega por él', async () => {
    const { actor, ids } = crear();
    conectar(actor, ids[2]!);
    await vi.advanceTimersByTimeAsync(GRACIA_MS - 5_000);

    conectar(actor, ids[0]!);
    await vi.advanceTimersByTimeAsync(GRACIA_MS * 2);

    expect(actor.estado.dados).toBeNull();
  });

  it('si no hay nadie conectado la partida se congela: no se juega sola', async () => {
    const { actor } = crear();
    await vi.advanceTimersByTimeAsync(GRACIA_MS * 5);
    expect(actor.estado.version).toBe(0);
  });

  it('si al que le toca está conectado, el piloto no interviene', async () => {
    const { actor, ids } = crear();
    conectar(actor, ids[0]!);
    await vi.advanceTimersByTimeAsync(GRACIA_MS * 5);
    expect(actor.estado.dados).toBeNull();
  });

  it('pasada la gracia, los turnos siguientes de un ausente van deprisa y no esperan otra gracia', async () => {
    const { actor, ids } = crear();
    conectar(actor, ids[2]!);
    await vi.advanceTimersByTimeAsync(GRACIA_MS + 1_000);
    const antes = actor.estado.version;

    await vi.advanceTimersByTimeAsync(10 * RITMO_MS);

    expect(actor.estado.version - antes).toBeGreaterThanOrEqual(3);
  });

  it('con dos ausentes seguidos, el segundo no espera una gracia más desde su turno', async () => {
    const { actor, ids } = crear();
    conectar(actor, ids[2]!);
    await vi.advanceTimersByTimeAsync(GRACIA_MS + 1_000);

    await vi.advanceTimersByTimeAsync(30 * RITMO_MS);

    // Ya pasó el turno de ids[0] y le tocó (o le toca) a ids[1], que también lleva ausente desde el principio.
    const turnosJugados = actor.estado.turnoDe !== 0 || actor.estado.tiradas >= 2;
    expect(turnosJugados).toBe(true);
  });

  it('quien sigue conectado nunca juega por piloto: sus turnos esperan', async () => {
    const { actor, ids } = crear({ turnoDe: 2 });
    conectar(actor, ids[2]!);
    await vi.advanceTimersByTimeAsync(GRACIA_MS * 10);
    expect(actor.estado.version).toBe(0);
  });

  it('la presencia dice quién va en piloto una vez pasada la gracia', async () => {
    const { actor, ids } = crear();
    conectar(actor, ids[2]!);
    expect(actor.presencia().piloto).toEqual([]);

    await vi.advanceTimersByTimeAsync(GRACIA_MS + 1_000);

    expect(actor.presencia().piloto).toContain(ids[0]);
    expect(actor.presencia().piloto).not.toContain(ids[2]);
  });

  it('avisa a los oyentes cuando el piloto entra en juego', async () => {
    const { actor, ids } = crear();
    conectar(actor, ids[2]!);
    const avisos: Presencia[] = [];
    actor.alCambiarPresencia((p) => avisos.push(p));

    await vi.advanceTimersByTimeAsync(GRACIA_MS + 1_000);

    expect(avisos.some((p) => p.piloto.includes(ids[0]!))).toBe(true);
  });

  it('en la preparación también coloca por quien no está', async () => {
    const { actor, ids } = crear(null);
    expect(actor.estado.fase).toBe('PREPARACION_POBLADO');
    conectar(actor, ids[2]!);

    await vi.advanceTimersByTimeAsync(GRACIA_MS + RITMO_MS / 2);

    expect(Object.keys(actor.estado.edificios)).toHaveLength(1);
    expect(actor.estado.fase).toBe('PREPARACION_CAMINO');
  });

  it('en el descarte solo se descarta por los ausentes; el que está conectado conserva el suyo', async () => {
    const { actor, ids } = crear();
    const [a, , c] = ids as [string, string, string];
    const conMano = actor.estado.jugadores.map((j) =>
      j.id === a || j.id === c
        ? { ...j, recursos: { MADERA: 4, LADRILLO: 4, OVEJA: 4, TRIGO: 4, MINERAL: 4 } }
        : j,
    );
    const { mesa, estado } = crearPartidaNueva(['j1', 'j2', 'j3'], { semillaMapa: 'ausentes' });
    const base: Estado = {
      ...estado,
      jugadores: conMano,
      fase: 'DESCARTE',
      pasoPreparacion: 6,
      turnoDe: 0,
      descartesPendientes: { [a]: 10, [c]: 10 },
    };
    const aislado = new PartidaActor(mesa, base, {
      graciaAusenteMs: GRACIA_MS,
      ritmoPilotoMs: RITMO_MS,
    });
    conectar(aislado, c);

    await vi.advanceTimersByTimeAsync(GRACIA_MS + 1_000);

    expect(aislado.estado.descartesPendientes[a]).toBeUndefined();
    expect(aislado.estado.descartesPendientes[c]).toBe(10);
    expect(actor.estado.version).toBe(0);
  });
});

describe('PartidaActor: las jugadas forzadas no cuentan como actividad', () => {
  it('el piloto no renueva la última actividad, para que una partida abandonada caduque', async () => {
    const { actor, ids } = crear();
    conectar(actor, ids[2]!);
    const alConectar = actor.ultimaActividad;

    await vi.advanceTimersByTimeAsync(GRACIA_MS + 20 * RITMO_MS);

    expect(actor.estado.version).toBeGreaterThan(0);
    expect(actor.ultimaActividad).toBe(alConectar);
  });

  it('una jugada de verdad sí la renueva', async () => {
    const { actor, ids } = crear();
    conectar(actor, ids[0]!);
    await vi.advanceTimersByTimeAsync(5_000);

    await actor.enviar({ tipo: 'TIRAR_DADOS', jugador: ids[0]! });

    expect(actor.ultimaActividad).toBe(Date.now());
  });
});

describe('PartidaActor.detener', () => {
  it('detenida, el piloto no vuelve a jugar', async () => {
    const { actor, ids } = crear();
    conectar(actor, ids[2]!);
    actor.detener();
    await vi.advanceTimersByTimeAsync(GRACIA_MS * 5);
    expect(actor.estado.version).toBe(0);
  });
});

describe('PartidaActor: abandono', () => {
  it('quien abandona deja de contar como conectado aunque siga con la pestaña abierta', async () => {
    const { actor, ids } = crear();
    conectar(actor, ids[0]!);
    conectar(actor, ids[2]!);

    await actor.enviar({ tipo: 'ABANDONAR', jugador: ids[0]! });

    expect(actor.presencia().conectados).toEqual([ids[2]]);
    expect(actor.presencia().abandonaron).toEqual([ids[0]]);
  });

  it('al abandonar se avisa a los oyentes de la presencia', async () => {
    const { actor, ids } = crear();
    conectar(actor, ids[2]!);
    const avisos: Presencia[] = [];
    actor.alCambiarPresencia((p) => avisos.push(p));

    await actor.enviar({ tipo: 'ABANDONAR', jugador: ids[1]! });

    expect(avisos.at(-1)?.abandonaron).toEqual([ids[1]]);
  });

  it('el piloto juega por quien abandonó enseguida, sin esperar la gracia', async () => {
    const { actor, ids } = crear(); // le toca a ids[0]
    conectar(actor, ids[2]!);
    await actor.enviar({ tipo: 'ABANDONAR', jugador: ids[0]! });
    const antes = Date.now();

    await vi.advanceTimersByTimeAsync(RITMO_MS + 100);

    expect(actor.estado.tiradas).toBeGreaterThanOrEqual(1);
    expect(Date.now() - antes).toBeLessThan(GRACIA_MS);
  });

  it('juega todo su turno (tirar y terminar) a ritmo corto hasta pasárselo al siguiente', async () => {
    const { actor, ids } = crear();
    conectar(actor, ids[2]!);
    await actor.enviar({ tipo: 'ABANDONAR', jugador: ids[0]! });

    await vi.advanceTimersByTimeAsync(20 * RITMO_MS);

    expect(actor.estado.turnoDe).not.toBe(0);
  });

  it('si solo queda uno sin abandonar, la partida termina con él de ganador y el piloto se apaga', async () => {
    const { actor, ids } = crear();
    conectar(actor, ids[2]!);
    await actor.enviar({ tipo: 'ABANDONAR', jugador: ids[0]! });
    await actor.enviar({ tipo: 'ABANDONAR', jugador: ids[1]! });
    expect(actor.estado.fase).toBe('FIN');
    expect(actor.estado.ganador).toBe(ids[2]);

    const version = actor.estado.version;
    await vi.advanceTimersByTimeAsync(GRACIA_MS * 3);
    expect(actor.estado.version).toBe(version);
  });

  it('si los únicos conectados son quienes abandonaron, nadie espera: la partida se congela', async () => {
    const { actor, ids } = crear();
    conectar(actor, ids[0]!);
    await actor.enviar({ tipo: 'ABANDONAR', jugador: ids[0]! });
    const version = actor.estado.version;

    await vi.advanceTimersByTimeAsync(GRACIA_MS * 3);

    expect(actor.estado.version).toBe(version);
  });
});
