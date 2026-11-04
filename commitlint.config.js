export default {
  extends: ['@commitlint/config-conventional'],
  // Los commits automáticos de Dependabot usan títulos largos: se excluyen.
  ignores: [(mensaje) => /^(chore|ci)\(deps(-dev)?\):/.test(mensaje)],
  rules: {
    // Tipos en inglés (convención), descripción libre en español
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'perf', 'ci']],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
  },
};
