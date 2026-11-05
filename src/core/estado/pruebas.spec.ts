import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { configDePrueba } from './pruebas.js';

describe('configDePrueba', () => {
  it.each(['A', 'AZ', 'AZA', 'AZAR', 'AZAR-', 'AZAR-A', 'AZAR-AZAR-', 'PRUEBA'])(
    'con la semilla %j la semillaAzar es válida e independiente de la del mapa',
    (semilla) => {
      const config = configDePrueba({ semilla });
      expect(config.semillaMapa).toBe(semilla);
      expect(config.semillaAzar.startsWith(semilla)).toBe(false);
    },
  );

  it('propiedad: nunca falla con una semilla alfanumérica cualquiera', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z0-9-]{1,10}$/), (semilla) => {
        const config = configDePrueba({ semilla });
        expect(config.semillaAzar.startsWith(config.semillaMapa)).toBe(false);
      }),
      { numRuns: 500 },
    );
  });

  it('no cambia la semilla por defecto de las pruebas (varias dependen de sus tiradas)', () => {
    expect(configDePrueba().semillaAzar).toBe('AZAR-PRUEBA');
    expect(configDePrueba({ semilla: 'X' }).semillaAzar).toBe('AZAR-X');
  });
});
