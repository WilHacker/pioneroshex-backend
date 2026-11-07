import { casillasPorRadio } from '../mapa/coordenadas.js';
import { crearGameConfig } from '../partida/game-config.js';
import { crearPartida } from './crear.js';
import { crearMesa } from './mesa.js';
import { vistaPara } from './vista.js';

describe('vistaPara con un mapa propio', () => {
  const config = crearGameConfig({
    semillaMapa: 'MAPA-PRUEBA',
    semillaAzar: '#secreta-de-prueba',
    jugadores: 3,
    mapa: {
      nombre: 'Radio 2',
      casillas: casillasPorRadio(2).map((c): [number, number] => [c.q, c.r]),
    },
  });
  const estado = crearPartida(crearMesa(config), ['j1', 'j2', 'j3']);

  it('no repite la lista de casillas en cada vista (el cliente ya la recibe en la mesa)', () => {
    const vista = vistaPara(estado, 'j1');
    expect(Object.keys(vista.config)).not.toContain('mapa');
  });

  it('sigue sin exponer la semilla del azar', () => {
    expect(JSON.stringify(vistaPara(estado, 'j1'))).not.toContain('#secreta-de-prueba');
    expect(JSON.stringify(vistaPara(estado, null))).not.toContain('#secreta-de-prueba');
  });
});
