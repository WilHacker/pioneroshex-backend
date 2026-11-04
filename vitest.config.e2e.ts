import { defineConfig } from 'vitest/config';

// El e2e usa una base de datos real: las variables salen de .env (local) o del entorno (CI).
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
