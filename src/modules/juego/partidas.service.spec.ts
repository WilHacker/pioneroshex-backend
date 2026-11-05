import { describe, expect, it } from 'vitest';
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
