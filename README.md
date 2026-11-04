# PionerosHex · Backend

Servidor autoritativo del juego multijugador PionerosHex (NestJS + TypeScript + Prisma).
El frontend vive en un repositorio aparte.

## Requisitos

- Node.js 24 (ver `.nvmrc`)
- pnpm (`corepack enable`)
- Docker (PostgreSQL y Redis locales)

## Puesta en marcha

```bash
cp .env.example .env     # y cambia POSTGRES_PASSWORD (y la misma clave en DATABASE_URL)
pnpm install             # instala dependencias, activa los hooks y genera el cliente de Prisma
pnpm db:up               # levanta PostgreSQL y Redis
pnpm start:dev
```

## Comandos

| Comando                        | Qué hace                                   |
| ------------------------------ | ------------------------------------------ |
| `pnpm start:dev`               | Servidor en modo desarrollo                |
| `pnpm build` / `start:prod`    | Compila y ejecuta la versión de producción |
| `pnpm lint`                    | oxlint                                     |
| `pnpm format` / `format:check` | Prettier (escribir / solo verificar)       |
| `pnpm typecheck`               | Verificación de tipos con `tsc`            |
| `pnpm test` / `test:cov`       | Tests unitarios / con cobertura            |
| `pnpm test:e2e`                | Tests end-to-end (requieren `pnpm db:up`)  |
| `pnpm smoke`                   | Compila, arranca y consulta `/health`      |
| `pnpm db:up` / `db:down`       | Levanta / apaga PostgreSQL y Redis         |
| `pnpm db:generate`             | Regenera el cliente de Prisma              |
| `pnpm db:migrate`              | Crea y aplica una migración (desarrollo)   |
| `pnpm db:migrate:deploy`       | Aplica migraciones pendientes (producción) |

## Ramas

Solo hay dos ramas permanentes y no se usan ramas de feature:

- **`develop`:** integración. Aquí se trabaja y se hacen los commits.
- **`main`:** producción. Solo recibe cambios de `develop` mediante pull request.

Reglas:

- El PR `develop` → `main` se fusiona con **merge commit** (no squash ni rebase), para que
  las dos ramas no se desalineen.
- No se borra `develop` al fusionar (desactivar "Automatically delete head branches").
- Dependabot abre sus PR contra `develop`.

## Calidad

- **pre-commit:** oxlint y prettier sobre los archivos modificados.
- **commit-msg:** commitlint. Formato `tipo: descripción`, con tipo en
  `feat, fix, refactor, docs, test, chore, perf, ci` y la descripción en español.
- **pre-push:** `typecheck` y tests.
- **CI (GitHub Actions):** lint, formato, tipos, tests con cobertura, e2e, smoke, auditoría
  de dependencias de producción, detección de secretos y build de la imagen Docker.
- Cobertura mínima del 80 % sobre `src/core` (lógica pura del juego).

## Convenciones

- Términos técnicos y estructurales en inglés (`core`, `modules`, `common`, `config`, `service`, `gateway`).
- Dominio del juego en español (`mapa`, `casilla`, `vertice`, `arista`, `camino`, `poblado`).
- Comentarios, logs, errores, docs y commits en español.
- Imports relativos con extensión `.js` (el proyecto es ESM); sin alias de rutas.
