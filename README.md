# PionerosHex · Backend

Servidor autoritativo del juego multijugador PionerosHex (NestJS + TypeScript).
El frontend vive en un repositorio aparte.

## Requisitos

- Node.js 24 (ver `.nvmrc`)
- pnpm (`corepack enable`)

## Comandos

| Comando                        | Qué hace                                   |
| ------------------------------ | ------------------------------------------ |
| `pnpm install`                 | Instala dependencias y activa los hooks    |
| `pnpm start:dev`               | Servidor en modo desarrollo                |
| `pnpm build` / `start:prod`    | Compila y ejecuta la versión de producción |
| `pnpm lint`                    | oxlint                                     |
| `pnpm format` / `format:check` | Prettier (escribir / solo verificar)       |
| `pnpm typecheck`               | Verificación de tipos con `tsc`            |
| `pnpm test` / `test:cov`       | Tests unitarios / con cobertura            |
| `pnpm test:e2e`                | Tests end-to-end                           |

## Calidad

- **pre-commit:** oxlint y prettier sobre los archivos modificados.
- **commit-msg:** commitlint. Formato `tipo: descripción`, con tipo en
  `feat, fix, refactor, docs, test, chore, perf, ci` y la descripción en español.
- **pre-push:** `typecheck` y tests.
- Cobertura mínima del 80 % sobre `src/core` (lógica pura del juego).

## Convenciones

- Términos técnicos y estructurales en inglés (`core`, `modules`, `common`, `config`, `service`, `gateway`).
- Dominio del juego en español (`mapa`, `casilla`, `vertice`, `arista`, `camino`, `poblado`).
- Comentarios, logs, errores, docs y commits en español.
- Imports relativos con extensión `.js` (el proyecto es ESM); sin alias de rutas.
