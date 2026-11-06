import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { OrigenGuard } from './origen.guard.js';

const contexto = (origin: string | undefined, sitio?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { ...(origin ? { origin } : {}), ...(sitio ? { 'sec-fetch-site': sitio } : {}) },
      }),
    }),
  }) as unknown as ExecutionContext;

const guard = new OrigenGuard(['http://localhost:3000', 'http://192.168.1.20:3000']);

describe('OrigenGuard', () => {
  it('deja pasar los orígenes del frontend', () => {
    expect(guard.canActivate(contexto('http://localhost:3000'))).toBe(true);
    expect(guard.canActivate(contexto('http://192.168.1.20:3000'))).toBe(true);
  });

  it('rechaza cualquier otro origen (otra página intentando usar tu cookie)', () => {
    expect(() => guard.canActivate(contexto('http://malo.example'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contexto('http://localhost:3001'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contexto('null'))).toThrow(ForbiddenException);
  });

  it('sin cabecera Origin (curl, pruebas) deja pasar: un navegador siempre la manda al escribir', () => {
    expect(guard.canActivate(contexto(undefined))).toBe(true);
  });

  it('rechaza lo que el navegador marca como de otro sitio, aunque el origen parezca bueno', () => {
    expect(() => guard.canActivate(contexto(undefined, 'cross-site'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contexto('http://localhost:3000', 'cross-site'))).toThrow(
      ForbiddenException,
    );
    expect(guard.canActivate(contexto('http://localhost:3000', 'same-site'))).toBe(true);
    expect(guard.canActivate(contexto(undefined, 'none'))).toBe(true);
  });
});
