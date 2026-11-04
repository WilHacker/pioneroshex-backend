import fc from 'fast-check';
import { semillaDesdeTexto } from './semilla.js';

describe('semillaDesdeTexto', () => {
  it('es determinista', () => {
    expect(semillaDesdeTexto('ANDES-2026')).toBe(semillaDesdeTexto('ANDES-2026'));
  });

  it('textos distintos dan semillas distintas', () => {
    expect(semillaDesdeTexto('ANDES-2026')).not.toBe(semillaDesdeTexto('ANDES-2027'));
    expect(semillaDesdeTexto('')).not.toBe(semillaDesdeTexto('a'));
  });

  it('propiedad: siempre devuelve un entero de 32 bits sin signo', () => {
    fc.assert(
      fc.property(fc.string(), (texto) => {
        const semilla = semillaDesdeTexto(texto);
        return Number.isInteger(semilla) && semilla >= 0 && semilla <= 0xffffffff;
      }),
    );
  });
});
