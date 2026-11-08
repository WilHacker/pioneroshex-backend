import { describe, expect, it } from 'vitest';
import { crearGameConfig } from '../partida/game-config.js';
import { aplicar } from './aplicar.js';
import { crearPartida } from './crear.js';
import { tirarDados } from './dados.js';
import { conCambios, mesaDePrueba } from './pruebas.js';

const suma = (d: readonly [number, number]): number => d[0] + d[1];
const tiradas = (semilla: string, n: number, modo: Parameters<typeof tirarDados>[2], hasta = 0) =>
  Array.from({ length: n }, (_, i) => tirarDados(semilla, i, modo, { sinSieteHasta: hasta }));

describe('GameConfig: nuevos modos de dados y arranque protegido', () => {
  it.each(['AZAR', 'EQUILIBRADO', 'BARAJA', 'SIN_RACHAS'] as const)(
    'acepta el modo %s',
    (modoDados) => {
      expect(mesaDePrueba({ modoDados }).config.modoDados).toBe(modoDados);
    },
  );

  it('rechaza un modo que no existe', () => {
    expect(() =>
      crearGameConfig({
        semillaMapa: 'm',
        semillaAzar: 'azar-secreto',
        modoDados: 'TRAMPA' as never,
      }),
    ).toThrow(/modoDados/);
  });

  it('el arranque protegido está apagado por defecto y solo admite verdadero o falso', () => {
    expect(mesaDePrueba().config.arranqueProtegido).toBe(false);
    expect(mesaDePrueba({ arranqueProtegido: true }).config.arranqueProtegido).toBe(true);
    expect(() =>
      crearGameConfig({
        semillaMapa: 'm',
        semillaAzar: 'azar-secreto',
        arranqueProtegido: 1 as never,
      }),
    ).toThrow(/arranqueProtegido/);
  });
});

describe('modo BARAJA', () => {
  it('es determinista', () => {
    expect(tiradas('b1', 60, 'BARAJA')).toEqual(tiradas('b1', 60, 'BARAJA'));
  });

  it('dentro de cada tanda no se repite ninguna combinación (como sacar cartas sin devolverlas)', () => {
    for (const semilla of ['b1', 'b2', 'b3']) {
      const lista = tiradas(semilla, 23 * 4, 'BARAJA');
      for (let tanda = 0; tanda < 4; tanda++) {
        const trozo = lista.slice(tanda * 23, (tanda + 1) * 23).map((d) => d.join('-'));
        expect(new Set(trozo).size).toBe(23);
      }
    }
  });

  it('se rebaraja antes de agotar el mazo: cada tanda usa 23 de las 36 cartas', () => {
    const [a, b] = [tiradas('b1', 23, 'BARAJA'), tiradas('b1', 46, 'BARAJA').slice(23)];
    expect(a.map((d) => d.join('-'))).not.toEqual(b.map((d) => d.join('-')));
  });

  it('con tiempo salen todas las combinaciones, también el 7', () => {
    const vistas = new Set(tiradas('b1', 23 * 12, 'BARAJA').map((d) => d.join('-')));
    expect(vistas.size).toBe(36);
  });

  it('las caras siempre están entre 1 y 6', () => {
    for (const d of tiradas('b9', 200, 'BARAJA'))
      expect(d.every((c) => c >= 1 && c <= 6)).toBe(true);
  });
});

describe('modo SIN_RACHAS', () => {
  it('el mismo total nunca sale tres veces seguidas', () => {
    for (const semilla of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']) {
      const totales = tiradas(semilla, 400, 'SIN_RACHAS').map(suma);
      for (let i = 2; i < totales.length; i++) {
        expect(totales[i] === totales[i - 1] && totales[i] === totales[i - 2]).toBe(false);
      }
    }
  });

  it('en el azar normal sí hay rachas de tres (si no, el modo no cambiaría nada)', () => {
    const conRacha = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'].some((semilla) => {
      const t = tiradas(semilla, 400, 'AZAR').map(suma);
      return t.some((x, i) => i >= 2 && x === t[i - 1] && x === t[i - 2]);
    });
    expect(conRacha).toBe(true);
  });

  it('es determinista y cada tirada sale igual pidiéndola suelta que dentro de la secuencia', () => {
    const secuencia = tiradas('r1', 80, 'SIN_RACHAS');
    expect(tiradas('r1', 80, 'SIN_RACHAS')).toEqual(secuencia);
    expect(tirarDados('r1', 57, 'SIN_RACHAS')).toEqual(secuencia[57]);
  });

  it('sigue siendo azar: salen muchos totales distintos, incluido el 7', () => {
    const totales = new Set(tiradas('r1', 300, 'SIN_RACHAS').map(suma));
    expect(totales.size).toBeGreaterThanOrEqual(10);
    expect(totales.has(7)).toBe(true);
  });
});

describe('arranque protegido', () => {
  it('sin 7 en las primeras tiradas, con cualquiera de los modos', () => {
    for (const modo of ['AZAR', 'EQUILIBRADO', 'BARAJA', 'SIN_RACHAS'] as const) {
      for (let s = 0; s < 60; s++) {
        const primeras = tiradas(`p${s}`, 8, modo, 8);
        expect(primeras.map(suma).includes(7)).toBe(false);
      }
    }
  });

  it('pasado el arranque, el 7 vuelve a poder salir', () => {
    const sale = Array.from({ length: 80 }, (_, s) =>
      tirarDados(`p${s}`, 8, 'AZAR', { sinSieteHasta: 8 }),
    )
      .map(suma)
      .includes(7);
    expect(sale).toBe(true);
  });

  it('sin protección, el 7 sí puede salir al principio (la regla marca la diferencia)', () => {
    const sale = Array.from({ length: 80 }, (_, s) => tirarDados(`p${s}`, 0, 'AZAR'))
      .map(suma)
      .includes(7);
    expect(sale).toBe(true);
  });

  it('es determinista', () => {
    expect(tiradas('p3', 8, 'AZAR', 8)).toEqual(tiradas('p3', 8, 'AZAR', 8));
  });

  it('las tiradas que ya no eran 7 no cambian por activar la protección', () => {
    const libre = tiradas('p5', 8, 'AZAR', 0);
    const protegida = tiradas('p5', 8, 'AZAR', 8);
    libre.forEach((d, i) => {
      if (suma(d) !== 7) expect(protegida[i]).toEqual(d);
    });
  });
});

describe('tirar los dados en una partida', () => {
  function tirarAlPrincipio(semilla: string, arranqueProtegido: boolean) {
    const mesa = mesaDePrueba({ jugadores: 3, semilla, arranqueProtegido });
    const inicial = crearPartida(mesa, ['a', 'b', 'c']);
    const estado = conCambios(inicial, { fase: 'PRE_TIRADA', pasoPreparacion: 6, turnoDe: 0 });
    const r = aplicar(mesa, estado, { tipo: 'TIRAR_DADOS', jugador: estado.jugadores[0]!.id });
    if (!r.ok) throw new Error(r.motivo);
    return r.estado.dados!;
  }

  it('con arranque protegido, la primera tirada nunca es un 7', () => {
    for (let s = 0; s < 80; s++) expect(suma(tirarAlPrincipio(`i${s}`, true))).not.toBe(7);
  });

  it('sin protección, alguna partida empieza con un 7', () => {
    const algunSiete = Array.from({ length: 80 }, (_, s) => tirarAlPrincipio(`i${s}`, false)).some(
      (d) => suma(d) === 7,
    );
    expect(algunSiete).toBe(true);
  });
});
