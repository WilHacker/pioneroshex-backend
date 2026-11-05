import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      // El umbral aplica solo a la lógica pura del juego (src/core).
      include: ['src/core/**/*.ts'],
      exclude: ['**/*.spec.ts', 'src/core/**/pruebas.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
