import { describe, expect, it } from 'vitest';
import { crearGameConfig } from '../partida/game-config.js';
import { crearRng, mezclar } from '../reglas/azar.js';
import { ordenPorDados } from '../reglas/orden.js';
import { crearPartida } from './crear.js';
import { mesaDePrueba, configDePrueba } from './pruebas.js';
import { vistaPara } from './vista.js';

const IDS = ['ana', 'beto', 'caro', 'dani'];
const idsDe = (e: { jugadores: readonly { id: string }[] }): string[] =>
  e.jugadores.map((j) => j.id);

describe('GameConfig.ordenDeTurno', () => {
  it('por defecto es aleatorio, como siempre', () => {
    expect(configDePrueba().ordenDeTurno).toBe('ALEATORIO');
  });

  it.each(['ALEATORIO', 'TIRADA', 'ENTRADA'] as const)('acepta %s', (ordenDeTurno) => {
    expect(configDePrueba({ ordenDeTurno }).ordenDeTurno).toBe(ordenDeTurno);
  });

  it('rechaza un modo que no existe', () => {
    expect(() =>
      crearGameConfig({
        semillaMapa: 'm',
        semillaAzar: 'azar-secreto',
        ordenDeTurno: 'TRAMPA' as never,
      }),
    ).toThrow(/ordenDeTurno/);
  });
});

describe('crearPartida: orden de turno', () => {
  it('ALEATORIO no cambia lo de siempre: se baraja con la semilla del azar y no hay sorteo', () => {
    const mesa = mesaDePrueba({ jugadores: 4, ordenDeTurno: 'ALEATORIO' });
    const estado = crearPartida(mesa, IDS);
    const esperado = mezclar(IDS, crearRng(`${mesa.config.semillaAzar}:orden`));
    expect(idsDe(estado)).toEqual(esperado);
    expect(estado.sorteo).toEqual([]);
  });

  it('ENTRADA respeta el orden de llegada: el primero de la lista es el primero en jugar', () => {
    const mesa = mesaDePrueba({ jugadores: 4, ordenDeTurno: 'ENTRADA' });
    const estado = crearPartida(mesa, IDS);
    expect(idsDe(estado)).toEqual(IDS);
    expect(estado.sorteo).toEqual([]);
  });

  it('TIRADA ordena por dados y guarda el sorteo para que todos lo vean igual', () => {
    const mesa = mesaDePrueba({ jugadores: 4, ordenDeTurno: 'TIRADA' });
    const estado = crearPartida(mesa, IDS);
    const sorteo = ordenPorDados(IDS, mesa.config.semillaAzar);
    expect(idsDe(estado)).toEqual(sorteo.orden);
    expect(estado.sorteo).toEqual(sorteo.rondas);
    expect(estado.sorteo.length).toBeGreaterThan(0);
  });

  it('TIRADA: quien saca más tira primero en la preparación', () => {
    const mesa = mesaDePrueba({ jugadores: 4, ordenDeTurno: 'TIRADA' });
    const estado = crearPartida(mesa, IDS);
    const totales = new Map(estado.sorteo[0]!.map((t) => [t.jugador, t.dados[0] + t.dados[1]]));
    const mejor = Math.max(...totales.values());
    expect(totales.get(estado.jugadores[estado.turnoDe]!.id)).toBe(mejor);
  });

  it('es determinista: la misma partida da el mismo orden', () => {
    const mesa = mesaDePrueba({ jugadores: 4, ordenDeTurno: 'TIRADA' });
    expect(idsDe(crearPartida(mesa, IDS))).toEqual(idsDe(crearPartida(mesa, IDS)));
  });

  it('el orden no depende de cómo se pasen los ids', () => {
    const mesa = mesaDePrueba({ jugadores: 4, ordenDeTurno: 'TIRADA' });
    const alReves = crearPartida(mesa, [...IDS].reverse());
    expect(idsDe(alReves)).toEqual(idsDe(crearPartida(mesa, IDS)));
  });
});

describe('Vista.sorteo', () => {
  it('el sorteo es público: lo ve cualquier jugador y un espectador', () => {
    const mesa = mesaDePrueba({ jugadores: 4, ordenDeTurno: 'TIRADA' });
    const estado = crearPartida(mesa, IDS);
    for (const observador of [...IDS, null]) {
      expect(vistaPara(estado, observador).sorteo).toEqual(estado.sorteo);
    }
  });

  it('sin sorteo, la vista lo trae vacío', () => {
    const estado = crearPartida(mesaDePrueba({ jugadores: 4 }), IDS);
    expect(vistaPara(estado, 'ana').sorteo).toEqual([]);
  });

  it('la vista no comparte referencias con el estado', () => {
    const estado = crearPartida(mesaDePrueba({ jugadores: 4, ordenDeTurno: 'TIRADA' }), IDS);
    const vista = vistaPara(estado, 'ana');
    expect(vista.sorteo).not.toBe(estado.sorteo);
    expect(vista.sorteo[0]).not.toBe(estado.sorteo[0]);
  });

  it('la configuración pública incluye el modo de orden', () => {
    const estado = crearPartida(mesaDePrueba({ jugadores: 4, ordenDeTurno: 'TIRADA' }), IDS);
    expect(vistaPara(estado, 'ana').config.ordenDeTurno).toBe('TIRADA');
  });
});
