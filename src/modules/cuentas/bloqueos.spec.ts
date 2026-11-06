import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { Bloqueos } from './bloqueos.js';

const VENTANA = 1000;

function crear() {
  let ahora = 0;
  const bloqueos = new Bloqueos(() => ahora, { porOrigen: 3, global: 5, ventanaMs: VENTANA });
  return {
    bloqueos,
    avanzar: (ms: number) => {
      ahora += ms;
    },
  };
}

const estado = (accion: () => unknown): number | null => {
  try {
    accion();
  } catch (e) {
    return (e as HttpException).getStatus();
  }
  return null;
};

describe('Bloqueos', () => {
  it('deja intentar hasta el límite y luego responde 429', () => {
    const { bloqueos } = crear();

    expect([1, 2, 3].map(() => estado(() => bloqueos.reservar('ana', 'ip1')))).toEqual([
      null,
      null,
      null,
    ]);
    expect(estado(() => bloqueos.reservar('ana', 'ip1'))).toBe(429);
  });

  it('reservar cuenta el intento al momento: diez peticiones a la vez no se cuelan', () => {
    const { bloqueos } = crear();
    const resultados = Array.from({ length: 10 }, () =>
      estado(() => bloqueos.reservar('ana', 'ip1')),
    );

    expect(resultados.filter((r) => r === null)).toHaveLength(3);
    expect(resultados.filter((r) => r === 429)).toHaveLength(7);
  });

  it('el bloqueo es por nombre y dirección: otra IP no queda bloqueada por los fallos de la primera', () => {
    const { bloqueos } = crear();
    for (let i = 0; i < 3; i += 1) bloqueos.reservar('ana', 'atacante');

    expect(estado(() => bloqueos.reservar('ana', 'atacante'))).toBe(429);
    expect(estado(() => bloqueos.reservar('ana', 'ip-de-ana'))).toBeNull();
  });

  it('pero entre todas las IPs hay un tope por nombre, más alto', () => {
    const { bloqueos } = crear();
    for (let i = 0; i < 5; i += 1) bloqueos.reservar('ana', `ip${i}`);

    expect(estado(() => bloqueos.reservar('ana', 'ip-nueva'))).toBe(429);
    expect(estado(() => bloqueos.reservar('beto', 'ip-nueva'))).toBeNull();
  });

  it('un acierto devuelve el intento y borra los fallos de esa IP', () => {
    const { bloqueos } = crear();
    bloqueos.reservar('ana', 'ip1');
    bloqueos.reservar('ana', 'ip1');
    const liberar = bloqueos.reservar('ana', 'ip1');

    liberar();

    expect(estado(() => bloqueos.reservar('ana', 'ip1'))).toBeNull();
    expect(estado(() => bloqueos.reservar('ana', 'ip1'))).toBeNull();
    expect(estado(() => bloqueos.reservar('ana', 'ip1'))).toBeNull();
    expect(estado(() => bloqueos.reservar('ana', 'ip1'))).toBe(429);
  });

  it('se levanta solo cuando pasa la ventana', () => {
    const { bloqueos, avanzar } = crear();
    for (let i = 0; i < 3; i += 1) bloqueos.reservar('ana', 'ip1');
    expect(estado(() => bloqueos.reservar('ana', 'ip1'))).toBe(429);

    avanzar(VENTANA + 1);

    expect(estado(() => bloqueos.reservar('ana', 'ip1'))).toBeNull();
  });

  it('no crece sin límite: olvida lo vencido al llegar al tope de entradas', () => {
    let ahora = 0;
    const bloqueos = new Bloqueos(() => ahora, {
      porOrigen: 3,
      global: 5,
      ventanaMs: VENTANA,
      entradasMax: 4,
    });
    for (let i = 0; i < 4; i += 1) bloqueos.reservar(`n${i}`, 'ip');
    ahora = VENTANA + 1;
    bloqueos.reservar('nuevo', 'ip');

    expect(bloqueos.tamano()).toBeLessThanOrEqual(2);
  });
});
