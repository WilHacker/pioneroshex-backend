import { describe, expect, it, vi } from 'vitest';
import { crearMesa } from '../../core/estado/mesa.js';
import { crearIdDeSala, LimiteDePartidasError, PartidasService } from './partidas.service.js';

const IDS = ['ana', 'beto', 'caro'];

describe('crearIdDeSala', () => {
  it('por defecto da 8 caracteres hexadecimales', () => {
    expect(crearIdDeSala(() => false)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('salta los ids que ya están en uso', () => {
    const generados = ['aaaaaaaa', 'aaaaaaaa', 'bbbbbbbb'];
    const id = crearIdDeSala(
      (candidato) => candidato === 'aaaaaaaa',
      () => generados.shift()!,
    );
    expect(id).toBe('bbbbbbbb');
  });

  it('no se queda en un bucle infinito si todo está ocupado', () => {
    expect(() =>
      crearIdDeSala(
        () => true,
        () => 'cccccccc',
      ),
    ).toThrow(/id de sala/);
  });
});

describe('PartidasService', () => {
  it('crea una partida con su id y su actor, y se puede recuperar por id', () => {
    const servicio = new PartidasService();
    const { id, actor } = servicio.crear(IDS);
    expect(id).toMatch(/^[0-9a-f]{8}$/);
    expect(servicio.obtener(id)).toBe(actor);
    expect(actor.estado.jugadores).toHaveLength(3);
    expect(servicio.cantidad).toBe(1);
  });

  it('cada partida tiene su id y su propia semilla secreta', () => {
    const servicio = new PartidasService();
    const uno = servicio.crear(IDS);
    const otro = servicio.crear(IDS);
    expect(uno.id).not.toBe(otro.id);
    expect(uno.actor.estado.config.semillaAzar).not.toBe(otro.actor.estado.config.semillaAzar);
  });

  it('pasa las opciones del anfitrión al motor', () => {
    const { actor } = new PartidasService().crear(IDS, { puntosVictoria: 6 });
    expect(actor.estado.config.puntosVictoria).toBe(6);
  });

  it('un id desconocido da undefined', () => {
    expect(new PartidasService().obtener('no-existe')).toBeUndefined();
  });

  it('eliminar quita la partida una sola vez', () => {
    const servicio = new PartidasService();
    const { id } = servicio.crear(IDS);
    expect(servicio.eliminar(id)).toBe(true);
    expect(servicio.eliminar(id)).toBe(false);
    expect(servicio.obtener(id)).toBeUndefined();
    expect(servicio.cantidad).toBe(0);
  });

  it('si el motor rechaza la partida, no queda nada registrado', () => {
    const servicio = new PartidasService();
    expect(() => servicio.crear(['a', 'a', 'b'])).toThrow();
    expect(servicio.cantidad).toBe(0);
  });

  it('tiene un tope de partidas vivas para no agotar la memoria', () => {
    const servicio = new PartidasService(2);
    const { id } = servicio.crear(IDS);
    servicio.crear(IDS);
    expect(() => servicio.crear(IDS)).toThrow(LimiteDePartidasError);
    expect(servicio.cantidad).toBe(2);
    servicio.eliminar(id);
    expect(() => servicio.crear(IDS)).not.toThrow();
  });
});

describe('PartidasService: expiración y restauración', () => {
  it('barrer elimina las partidas inactivas sin nadie conectado y devuelve sus ids', () => {
    let ahora = 0;
    const servicio = new PartidasService(10);
    const vieja = servicio.crear(IDS, {}, () => ({ ahora: () => ahora }));
    ahora = 5000;
    const reciente = servicio.crear(IDS, {}, () => ({ ahora: () => ahora }));
    const quitadas = servicio.barrer(3000, ahora);
    expect(quitadas).toEqual([vieja.id]);
    expect(servicio.obtener(vieja.id)).toBeUndefined();
    expect(servicio.obtener(reciente.id)).toBe(reciente.actor);
  });

  it('barrer detiene el reloj y el piloto de las partidas que quita, y solo de ellas', () => {
    let ahora = 0;
    const servicio = new PartidasService(10);
    const vieja = servicio.crear(IDS, {}, () => ({ ahora: () => ahora }));
    ahora = 5000;
    const reciente = servicio.crear(IDS, {}, () => ({ ahora: () => ahora }));
    const detenerVieja = vi.spyOn(vieja.actor, 'detener');
    const detenerReciente = vi.spyOn(reciente.actor, 'detener');

    servicio.barrer(3000, ahora);

    expect(detenerVieja).toHaveBeenCalledTimes(1);
    expect(detenerReciente).not.toHaveBeenCalled();
  });

  it('barrer respeta las partidas con alguien conectado', () => {
    const servicio = new PartidasService(10);
    const { id, actor } = servicio.crear(IDS, {}, () => ({ ahora: () => 0 }));
    const baja = actor.suscribir('ana', () => undefined);
    expect(servicio.barrer(1, 1_000_000)).toEqual([]);
    baja();
    expect(servicio.barrer(1, 1_000_000)).toEqual([id]);
  });

  it('crear entrega el id a la fábrica de opciones del actor', () => {
    const servicio = new PartidasService();
    let visto = '';
    const { id } = servicio.crear(IDS, {}, (idNuevo) => {
      visto = idNuevo;
      return {};
    });
    expect(visto).toBe(id);
  });

  it('restaurar admite partidas guardadas antes de que existiera «abandonados»', () => {
    const origen = new PartidasService().crear(IDS);
    const mesa = crearMesa(origen.actor.estado.config);
    const { abandonados: _nuevo, ...antiguo } = origen.actor.estado;

    const actor = new PartidasService().restaurar('viejo000', mesa, antiguo as never);

    expect(actor.estado.abandonados).toEqual([]);
    expect(actor.presencia().conectados).toEqual([]);
  });

  it('restaurar registra un actor con un id y un estado dados, respetando el tope', () => {
    const origen = new PartidasService().crear(IDS);
    const mesa = crearMesa(origen.actor.estado.config);
    const servicio = new PartidasService(1);
    const actor = servicio.restaurar('abcd1234', mesa, origen.actor.estado);
    expect(servicio.obtener('abcd1234')).toBe(actor);
    expect(actor.estado).toBe(origen.actor.estado);
    expect(() => servicio.restaurar('otro0000', mesa, origen.actor.estado)).toThrow(
      LimiteDePartidasError,
    );
    expect(() => servicio.restaurar('abcd1234', mesa, origen.actor.estado)).toThrow(/ya existe/);
  });
});
