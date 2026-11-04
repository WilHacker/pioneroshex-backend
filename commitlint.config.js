export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Tipos en inglés (convención), descripción libre en español
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'perf', 'ci']],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
  },
};
