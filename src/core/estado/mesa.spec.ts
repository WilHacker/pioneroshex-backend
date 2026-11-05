import { configDePrueba } from './pruebas.js';
import { crearMesa } from './mesa.js';

const config = configDePrueba({ semilla: 'MESA' });

describe('crearMesa', () => {
  it('radio 2 da el mapa clásico: 19 casillas, 54 vértices, 72 aristas, 9 puertos', () => {
    const mesa = crearMesa(config);
    expect(mesa.mapa.casillas).toHaveLength(19);
    expect(mesa.mapa.vertices).toHaveLength(54);
    expect(mesa.mapa.aristas).toHaveLength(72);
    expect(mesa.tablero.casillas).toHaveLength(19);
    expect(mesa.puertos).toHaveLength(9);
  });

  it('la misma config da el mismo tablero y otra semilla da otro', () => {
    expect(crearMesa(config).tablero).toEqual(crearMesa(config).tablero);
    const otra = crearMesa(configDePrueba({ semilla: 'OTRA' }));
    expect(otra.tablero).not.toEqual(crearMesa(config).tablero);
  });

  it('busca vértices por id', () => {
    const mesa = crearMesa(config);
    const real = mesa.mapa.vertices[0];
    expect(mesa.vertice('inexistente')).toBeUndefined();
    expect(mesa.vertice(real.id)).toBe(real);
  });

  it('busca aristas por id', () => {
    const mesa = crearMesa(config);
    const real = mesa.mapa.aristas[0];
    expect(mesa.arista('inexistente')).toBeUndefined();
    expect(mesa.arista(real.id)).toBe(real);
  });

  it('radio 3 con 6 jugadores da 37 casillas y 13 puertos', () => {
    const mesa = crearMesa(configDePrueba({ semilla: 'GRANDE', jugadores: 6 }));
    expect(mesa.mapa.casillas).toHaveLength(37);
    expect(mesa.puertos).toHaveLength(13);
  });
});
