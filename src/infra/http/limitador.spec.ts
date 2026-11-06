import { describe, expect, it } from 'vitest';
import { crearLimitador } from './limitador.js';

describe('crearLimitador', () => {
  it('deja pasar hasta el máximo dentro de la ventana y bloquea el resto', () => {
    const permitir = crearLimitador(3, 1000, () => 0);
    expect([permitir(), permitir(), permitir(), permitir()]).toEqual([true, true, true, false]);
  });

  it('vuelve a dejar pasar cuando las llamadas viejas salen de la ventana', () => {
    let ahora = 0;
    const permitir = crearLimitador(2, 1000, () => ahora);
    permitir();
    ahora = 500;
    permitir();
    expect(permitir()).toBe(false);
    ahora = 1001;
    expect(permitir()).toBe(true);
    expect(permitir()).toBe(false);
  });

  it('lo bloqueado no cuenta contra el límite', () => {
    let ahora = 0;
    const permitir = crearLimitador(1, 1000, () => ahora);
    permitir();
    for (let i = 0; i < 100; i++) permitir();
    ahora = 1001;
    expect(permitir()).toBe(true);
  });
});
