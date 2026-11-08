import { describe, expect, it } from 'vitest';
import { RepositorioSalasMemoria } from '../../infra/salas/repositorio-salas.memoria.js';
import { esquemaCambiarSala, esquemaCrearSala, esquemaEmpezar } from '../../schemas/salas.js';
import { PartidasService } from './partidas.service.js';
import { SalasService } from './salas.service.js';

const nuevo = () =>
  new SalasService(new PartidasService(), new RepositorioSalasMemoria(), { ahora: () => 1_000 });

describe('esquemas: ordenDeTurno', () => {
  it.each(['ALEATORIO', 'TIRADA', 'ENTRADA'])('acepta %s en crear, cambiar y empezar', (orden) => {
    expect(esquemaCrearSala.safeParse({ nombre: 'Ana', ordenDeTurno: orden }).success).toBe(true);
    expect(esquemaCambiarSala.safeParse({ ordenDeTurno: orden }).success).toBe(true);
    expect(esquemaEmpezar.safeParse({ ordenDeTurno: orden }).success).toBe(true);
  });

  it.each(['tirada', 'DADOS', '', 1, null])('rechaza %j', (orden) => {
    expect(esquemaCambiarSala.safeParse({ ordenDeTurno: orden }).success).toBe(false);
  });
});

describe('SalasService: orden de turno de la partida', () => {
  async function conTres(reglas: Parameters<SalasService['crear']>[3]) {
    const salas = nuevo();
    const ana = await salas.crear('Ana', false, undefined, reglas);
    await salas.unirse(ana.salaId, 'Beto');
    await salas.unirse(ana.salaId, 'Cleo');
    await salas.empezar(ana.salaId, ana.token, {});
    return salas.partida(ana.salaId)!.estado;
  }

  it('TIRADA: la partida arranca con un sorteo hecho con dados', async () => {
    const estado = await conTres({ ordenDeTurno: 'TIRADA' });
    expect(estado.config.ordenDeTurno).toBe('TIRADA');
    expect(estado.sorteo.length).toBeGreaterThan(0);
    expect(estado.sorteo[0]).toHaveLength(3);
  });

  it('ENTRADA: se juega en el orden en que se entró a la sala, con el anfitrión primero', async () => {
    const estado = await conTres({ ordenDeTurno: 'ENTRADA' });
    expect(estado.jugadores.map((j) => j.id)).toEqual(['j1', 'j2', 'j3']);
    expect(estado.sorteo).toEqual([]);
  });

  it('sin elegir nada sigue siendo aleatorio', async () => {
    const estado = await conTres({});
    expect(estado.config.ordenDeTurno).toBe('ALEATORIO');
    expect(estado.sorteo).toEqual([]);
  });

  it('el anfitrión lo puede cambiar en la sala de espera', async () => {
    const salas = nuevo();
    const ana = await salas.crear('Ana');
    await salas.unirse(ana.salaId, 'Beto');
    await salas.cambiar(ana.salaId, ana.token, { ordenDeTurno: 'ENTRADA' });
    expect(salas.estado(ana.salaId).opciones).toMatchObject({ ordenDeTurno: 'ENTRADA' });
    await salas.empezar(ana.salaId, ana.token, {});
    expect(salas.partida(ana.salaId)!.estado.jugadores.map((j) => j.id)).toEqual(['j1', 'j2']);
  });

  it('con jugadores que salieron, el sorteo cuenta solo a los que quedan', async () => {
    const salas = nuevo();
    const ana = await salas.crear('Ana', false, undefined, { ordenDeTurno: 'TIRADA' });
    const beto = await salas.unirse(ana.salaId, 'Beto');
    await salas.unirse(ana.salaId, 'Cleo');
    await salas.salir(ana.salaId, beto.token);
    await salas.empezar(ana.salaId, ana.token, {});
    const { sorteo, jugadores } = salas.partida(ana.salaId)!.estado;
    expect(jugadores.map((j) => j.id).toSorted()).toEqual(['j1', 'j3']);
    expect(sorteo[0]!.map((t) => t.jugador).toSorted()).toEqual(['j1', 'j3']);
  });
});
