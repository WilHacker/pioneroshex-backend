import { validarEnv } from './env.schema.js';

const base = {
  DATABASE_URL: 'postgresql://usuario:clave@localhost:5432/db',
  FRONTEND_URL: 'http://localhost:3000',
};

describe('validarEnv', () => {
  it('aplica valores por defecto cuando solo están las variables obligatorias', () => {
    const env = validarEnv(base);

    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe('development');
    expect(env.REDIS_HOST).toBe('localhost');
    expect(env.REDIS_PORT).toBe(6379);
  });

  it('convierte PORT desde texto a número', () => {
    expect(validarEnv({ ...base, PORT: '4000' }).PORT).toBe(4000);
  });

  it('falla indicando la variable cuando falta DATABASE_URL', () => {
    expect(() => validarEnv({ FRONTEND_URL: base.FRONTEND_URL })).toThrow(/DATABASE_URL/);
  });

  it('rechaza una DATABASE_URL que no es de PostgreSQL', () => {
    expect(() => validarEnv({ ...base, DATABASE_URL: 'mysql://x' })).toThrow(/postgresql/);
  });

  it('rechaza una FRONTEND_URL inválida', () => {
    expect(() => validarEnv({ ...base, FRONTEND_URL: 'no-es-url' })).toThrow(/FRONTEND_URL/);
  });

  it('rechaza un PORT no numérico', () => {
    expect(() => validarEnv({ ...base, PORT: 'abc' })).toThrow(/PORT/);
  });
});
