import { describe, expect, it } from 'vitest';
import { aplicar } from './aplicar.js';
import { crearPartida } from './crear.js';
import { tirarDados } from './dados.js';
import { decidir } from './decidir.js';
import { repartirProduccion } from './produccion.js';
import { conCambios, mesaDePrueba } from './pruebas.js';
import type { Edificio, Estado } from './tipos.js';

const mesa = mesaDePrueba({ jugadores: 3 });
const inicial = crearPartida(mesa, ['a', 'b', 'c']);
const a = inicial.jugadores[0]!.id;
const b = inicial.jugadores[1]!.id;
const preTirada = conCambios(inicial, { fase: 'PRE_TIRADA', pasoPreparacion: 6 });
const principal = conCambios(preTirada, { fase: 'FASE_PRINCIPAL' });
const tirar = (jugador: string) => ({ tipo: 'TIRAR_DADOS' as const, jugador });
const terminar = (jugador: string) => ({ tipo: 'TERMINAR_TURNO' as const, jugador });

/** Todos los vértices con un poblado del jugador `a`: cualquier tirada distinta de 7 produce. */
const edificiosDe = (m: typeof mesa, dueno: string): Record<string, Edificio> =>
  Object.fromEntries(m.mapa.vertices.map((v) => [v.id, { dueno, tipo: 'POBLADO' as const }]));

describe('TIRAR_DADOS con dados equilibrados', () => {
  it('usa el modo de la configuración de la partida', () => {
    const equilibrada = mesaDePrueba({ jugadores: 3, modoDados: 'EQUILIBRADO' });
    const estado = conCambios(crearPartida(equilibrada, ['a', 'b', 'c']), {
      fase: 'PRE_TIRADA',
      pasoPreparacion: 6,
      tiradas: 5,
    });
    const jugador = estado.jugadores[estado.turnoDe]!.id;
    const r = decidir(equilibrada, estado, tirar(jugador));
    if (!r.ok) throw new Error(r.motivo);
    const evento = r.eventos.find((e) => e.tipo === 'DADOS_TIRADOS');
    expect(evento).toMatchObject({
      dados: tirarDados(estado.config.semillaAzar, 5, 'EQUILIBRADO'),
    });
  });
});

describe('TIRAR_DADOS', () => {
  it('emite DADOS_TIRADOS, la producción y pasa a FASE_PRINCIPAL en ese orden', () => {
    const estado = conCambios(preTirada, { turnoDe: 1, edificios: edificiosDe(mesa, b) });
    const r = decidir(mesa, estado, tirar(b));
    if (!r.ok) throw new Error(r.motivo);
    const dados = tirarDados(estado.config.semillaAzar, estado.tiradas);
    // Con un 7 no hay producción y `medio` quedaría vacío: la primera tirada de la semillaAzar de
    // `mesaDePrueba` ('AZAR-PRUEBA') no es 7. Si cambia la semilla o el azar, este aviso falla primero.
    expect(dados[0] + dados[1], 'la tirada de la semilla de prueba no debe ser 7').not.toBe(7);
    expect(r.eventos[0]).toEqual({ tipo: 'DADOS_TIRADOS', jugador: b, dados, causa: 'VOLUNTARIA' });
    expect(r.eventos.at(-1)).toEqual({
      tipo: 'FASE_CAMBIADA',
      fase: 'FASE_PRINCIPAL',
      turnoDe: 1,
      pasoPreparacion: 6,
    });
    const medio = r.eventos.slice(1, -1);
    expect(medio.length).toBeGreaterThan(0);
    expect(medio.every((e) => e.tipo === 'RECURSOS_REPARTIDOS')).toBe(true);
  });

  it('al aplicar: fase FASE_PRINCIPAL, dados exactos y tiradas sube', () => {
    const r = aplicar(mesa, preTirada, tirar(a));
    if (!r.ok) throw new Error(r.motivo);
    expect(r.estado.fase).toBe('FASE_PRINCIPAL');
    expect(r.estado.dados).toEqual(tirarDados(preTirada.config.semillaAzar, 0));
    expect(r.estado.tiradas).toBe(preTirada.tiradas + 1);
  });

  it.each(['PREPARACION_POBLADO', 'PREPARACION_CAMINO', 'FASE_PRINCIPAL'] as const)(
    'fuera de PRE_TIRADA (%s) → FASE_INCORRECTA',
    (fase) => {
      const estado = conCambios(preTirada, { fase });
      expect(decidir(mesa, estado, tirar(a))).toEqual({ ok: false, motivo: 'FASE_INCORRECTA' });
    },
  );

  it('tirar dos veces seguidas → FASE_INCORRECTA', () => {
    const r = aplicar(mesa, preTirada, tirar(a));
    if (!r.ok) throw new Error(r.motivo);
    expect(decidir(mesa, r.estado, tirar(a))).toEqual({ ok: false, motivo: 'FASE_INCORRECTA' });
  });

  it('la producción usa la SUMA de los dos dados, no un solo dado', () => {
    // Busca una semilla cuya producción por suma difiera de la de cada dado por separado.
    for (let i = 0; i < 500; i++) {
      const m = mesaDePrueba({ jugadores: 3, semilla: `suma-${i}` });
      const partida = crearPartida(m, ['a', 'b', 'c']);
      const j0 = partida.jugadores[0]!.id;
      const estado = conCambios(partida, {
        fase: 'PRE_TIRADA',
        pasoPreparacion: 6,
        edificios: edificiosDe(m, j0),
      });
      const [x, y] = tirarDados(estado.config.semillaAzar, estado.tiradas);
      const porSuma = repartirProduccion(m, estado, x + y);
      if (x + y === 7 || porSuma.length === 0) continue;
      if (
        JSON.stringify(porSuma) === JSON.stringify(repartirProduccion(m, estado, x)) ||
        JSON.stringify(porSuma) === JSON.stringify(repartirProduccion(m, estado, y))
      ) {
        continue;
      }
      const r = decidir(m, estado, tirar(j0));
      if (!r.ok) throw new Error(r.motivo);
      expect(r.eventos.slice(1, -1)).toEqual(porSuma);
      return;
    }
    throw new Error('No se halló una semilla que distinga suma de un solo dado');
  });

  it('un 7 no produce recursos ni mueve el ladrón (se completa en la Fase 2)', () => {
    let semillaConSiete: string | null = null;
    for (let i = 0; i < 500 && semillaConSiete === null; i++) {
      const [x, y] = tirarDados(`sem-${i}`, 0);
      if (x + y === 7) semillaConSiete = `sem-${i}`;
    }
    if (semillaConSiete === null) throw new Error('No se halló una semilla que sume 7');
    const m = mesaDePrueba({ jugadores: 3, semillaAzar: semillaConSiete });
    const partida = crearPartida(m, ['a', 'b', 'c']);
    const j0 = partida.jugadores[0]!.id;
    const estado = conCambios(partida, {
      fase: 'PRE_TIRADA',
      pasoPreparacion: 6,
      edificios: edificiosDe(m, j0),
    });
    expect(estado.config.semillaAzar).toBe(semillaConSiete);
    const r = decidir(m, estado, tirar(j0));
    if (!r.ok) throw new Error(r.motivo);
    const tirada = r.eventos[0];
    if (tirada?.tipo !== 'DADOS_TIRADOS') throw new Error('Se esperaba DADOS_TIRADOS');
    expect(tirada.dados[0] + tirada.dados[1]).toBe(7);
    expect(r.eventos.map((e) => e.tipo)).toEqual(['DADOS_TIRADOS', 'FASE_CAMBIADA']);
    const aplicado = aplicar(m, estado, tirar(j0));
    if (!aplicado.ok) throw new Error(aplicado.motivo);
    expect(aplicado.estado.ladron).toEqual(estado.ladron);
  });
});

describe('TERMINAR_TURNO', () => {
  it.each(['PREPARACION_POBLADO', 'PREPARACION_CAMINO', 'PRE_TIRADA'] as const)(
    'fuera de FASE_PRINCIPAL (%s) → FASE_INCORRECTA',
    (fase) => {
      const estado = conCambios(preTirada, { fase });
      expect(decidir(mesa, estado, terminar(a))).toEqual({ ok: false, motivo: 'FASE_INCORRECTA' });
    },
  );

  it.each([
    [0, 1],
    [1, 2],
    [2, 0],
  ])('desde turnoDe %i el siguiente es %i y queda PRE_TIRADA sin dados', (turnoDe, siguiente) => {
    const id = inicial.jugadores[turnoDe]!.id;
    const conDados = conCambios(principal, { turnoDe, dados: [3, 4] });
    expect(decidir(mesa, conDados, terminar(id))).toEqual({
      ok: true,
      eventos: [{ tipo: 'TURNO_TERMINADO', jugador: id, siguiente, causa: 'VOLUNTARIA' }],
    });
    const res = aplicar(mesa, conDados, terminar(id));
    if (!res.ok) throw new Error(res.motivo);
    expect(res.estado).toMatchObject({ turnoDe: siguiente, fase: 'PRE_TIRADA', dados: null });
  });

  it.each([2, 3, 10])('con %i jugadores, tras n turnos vuelve al primero', (n) => {
    const m = mesaDePrueba({ jugadores: n });
    const ids = Array.from({ length: n }, (_, k) => `j${k}`);
    let estado: Estado = conCambios(crearPartida(m, ids), {
      fase: 'PRE_TIRADA',
      pasoPreparacion: 2 * n,
    });
    for (let i = 0; i < n; i++) {
      const id = estado.jugadores[estado.turnoDe]!.id;
      const rTirada = aplicar(m, estado, tirar(id));
      if (!rTirada.ok) throw new Error(rTirada.motivo);
      estado = rTirada.estado;

      if (estado.fase === 'MOVER_LADRON') {
        const actual = estado.ladron;
        const destino = m.tablero.casillas.find(
          (c) => !actual || c.hex.q !== actual.q || c.hex.r !== actual.r,
        )!.hex;
        const rLadron = aplicar(m, estado, {
          tipo: 'MOVER_LADRON',
          jugador: id,
          destino,
          victima: null,
        });
        if (!rLadron.ok) throw new Error(rLadron.motivo);
        estado = rLadron.estado;
      }

      const rFin = aplicar(m, estado, terminar(id));
      if (!rFin.ok) throw new Error(rFin.motivo);
      estado = rFin.estado;
    }
    expect(estado.turnoDe).toBe(0);
    expect(estado.fase).toBe('PRE_TIRADA');
    expect(estado.tiradas).toBe(n);
  });

  describe('Modo B (turnRuleMode: B con 5+ jugadores)', () => {
    it('inicia fase especial de construcción y da turno a cada rival en sentido horario', () => {
      const m = mesaDePrueba({ jugadores: 5, turnRuleMode: 'B' });
      const ids = ['j0', 'j1', 'j2', 'j3', 'j4'];
      let estado = conCambios(crearPartida(m, ids), {
        fase: 'FASE_PRINCIPAL',
        turnoDe: 0,
        pasoPreparacion: 10,
      });

      const rFin = aplicar(m, estado, terminar(estado.jugadores[0]!.id));
      if (!rFin.ok) throw new Error(rFin.motivo);
      estado = rFin.estado;

      expect(estado.fase).toBe('CONSTRUCCION_ESPECIAL');
      expect(estado.turnoEspecialDe).toBe(1);

      // Los constructores especiales van pasando uno a uno
      for (let i = 1; i <= 3; i++) {
        const constructorId = estado.jugadores[estado.turnoEspecialDe!]!.id;
        const rPasar = aplicar(m, estado, {
          tipo: 'PASAR_CONSTRUCCION_ESPECIAL',
          jugador: constructorId,
        });
        if (!rPasar.ok) throw new Error(rPasar.motivo);
        estado = rPasar.estado;
        expect(estado.fase).toBe('CONSTRUCCION_ESPECIAL');
        expect(estado.turnoEspecialDe).toBe(i + 1);
      }

      // El último constructor especial (índice 4) pasa
      const ultimoId = estado.jugadores[estado.turnoEspecialDe!]!.id;
      const rUltimo = aplicar(m, estado, {
        tipo: 'PASAR_CONSTRUCCION_ESPECIAL',
        jugador: ultimoId,
      });
      if (!rUltimo.ok) throw new Error(rUltimo.motivo);
      estado = rUltimo.estado;

      // Se cierra la fase especial y pasa a PRE_TIRADA del siguiente turno normal (jugador 1)
      expect(estado.fase).toBe('PRE_TIRADA');
      expect(estado.turnoDe).toBe(1);
      expect(estado.turnoEspecialDe).toBeNull();
    });
  });
});
