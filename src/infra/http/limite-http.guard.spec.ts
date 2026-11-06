import type { ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { LimiteHttpGuard } from './limite-http.guard.js';

function contexto(ip: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ ip }) }),
  } as unknown as ExecutionContext;
}

describe('LimiteHttpGuard', () => {
  it('deja pasar hasta el máximo y responde 429 después', () => {
    const guard = new LimiteHttpGuard({ maximo: 2, ventanaMs: 1000, ahora: () => 0 });

    expect(guard.canActivate(contexto('1.1.1.1'))).toBe(true);
    expect(guard.canActivate(contexto('1.1.1.1'))).toBe(true);
    expect(() => guard.canActivate(contexto('1.1.1.1'))).toThrow(HttpException);
    try {
      guard.canActivate(contexto('1.1.1.1'));
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(429);
    }
  });

  it('cuenta cada dirección por separado', () => {
    const guard = new LimiteHttpGuard({ maximo: 1, ventanaMs: 1000, ahora: () => 0 });

    expect(guard.canActivate(contexto('1.1.1.1'))).toBe(true);
    expect(guard.canActivate(contexto('2.2.2.2'))).toBe(true);
  });

  it('vuelve a permitir cuando pasa la ventana', () => {
    let ahora = 0;
    const guard = new LimiteHttpGuard({ maximo: 1, ventanaMs: 1000, ahora: () => ahora });
    guard.canActivate(contexto('1.1.1.1'));
    ahora = 1001;

    expect(guard.canActivate(contexto('1.1.1.1'))).toBe(true);
  });

  it('no crece sin límite: olvida las direcciones inactivas', () => {
    let ahora = 0;
    const guard = new LimiteHttpGuard({
      maximo: 1,
      ventanaMs: 1000,
      ahora: () => ahora,
      maxDirecciones: 3,
    });
    for (const ip of ['a', 'b', 'c']) guard.canActivate(contexto(ip));
    ahora = 5000;
    guard.canActivate(contexto('d'));

    expect(guard.tamano()).toBe(1);
  });
});
