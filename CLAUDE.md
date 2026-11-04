# PionerosHex · Backend

Servidor **autoritativo** del juego multijugador PionerosHex: NestJS 12, TypeScript 6, Prisma 7,
PostgreSQL, ESM, pnpm 11, Node 24. El frontend está en el repo hermano `pioneroshex-frontend`.

## Comandos

`pnpm start:dev` · `build` · `lint` · `format:check` · `typecheck` · `test` · `test:cov` ·
`test:e2e` (requiere `pnpm db:up` y `.env`) · `smoke` · `db:up` / `db:down` · `db:generate` ·
`db:migrate`.

Antes de dar algo por terminado: `lint`, `typecheck` y `test:cov`. Si toca `/health` o la base de
datos, también `test:e2e`.

## Flujo de ramas y commits

- Solo `main` y `develop`. **Se trabaja en `develop`.** `main` recibe cambios solo por PR
  `develop` → `main`, fusionado con **merge commit** (nunca squash ni rebase: desalinea las ramas).
- No hay ramas de feature ni protección de ramas (plan gratuito, repo privado).
- Commits: `tipo: descripción`. Tipos: `feat, fix, refactor, docs, test, chore, perf, ci`.
  Descripción en español, encabezado de máximo 100 caracteres.
- Husky corre lint-staged (pre-commit), commitlint (commit-msg) y typecheck + test (pre-push).
  Nunca usar `--no-verify`.

## Arquitectura

```
src/config/   variables de entorno validadas con Zod (falla al arrancar si algo falta)
src/infra/    adaptadores externos (prisma/)
src/modules/  funcionalidades de Nest (health/, luego salas, juego...)
src/core/     TypeScript PURO del juego (aún no existe)
```

- `core/` **no importa nada de Nest, `infra/` ni `modules/`**. Se prueba sin levantar nada.
- Imports **relativos con extensión `.js`** (es ESM). Sin alias de rutas: `tsc` no los reescribe
  y en `dist/` fallarían aunque los tests pasen.
- El servidor es la única fuente de verdad. Todo evento entrante se valida con Zod, y a cada
  jugador se le envía una vista filtrada (conteo de cartas rivales, no su contenido).
- CORS **no es autenticación**: con un origen fijo el servidor siempre responde ese origen y es el
  navegador quien bloquea.

## Convenciones

- Términos técnicos y estructurales en inglés (`core`, `modules`, `config`, `service`, `gateway`).
- Dominio del juego en español (`mapa`, `casilla`, `vertice`, `arista`, `camino`, `poblado`).
- Comentarios, logs, errores, docs y commits en español. Sin `console.log` (usar `Logger`).
- Inmutabilidad: devolver objetos nuevos, no mutar los recibidos.
- TDD en `core/`: primero el test. Cobertura mínima del 80 % sobre `src/core`.

## Decisiones del dominio

- Coordenadas cúbicas `(q, r, s)`, `q + r + s = 0`, hexágonos _pointy-top_.
- Para radio R: casillas `3R(R+1)+1`, vértices `6(R+1)²`, aristas `9R²+15R+6`.
  R=2 → **19, 54 y 72**. La fórmula de aristas del informe original (`9R(R+1)+6`) es incorrecta.
- Eventos de socket en español (`juego:construirCamino`): nombres **provisionales**.

## Trampas conocidas

- **TypeScript fijado en 6** y `@types/node` en 24 (= Node 24). El CLI de Nest no soporta TS 7
  hasta la 7.1. Dependabot ignora esos saltos mayores.
- **pnpm 11 bloquea los scripts de instalación.** Aprobar por nombre en `pnpm-workspace.yaml`
  (`pnpm approve-builds <paquete>`), nunca `--all`.
- **Prisma 7:** la URL va en `prisma.config.ts`, no en el schema. El cliente se genera en
  `src/generated/` (ignorado por git); si falta, `pnpm db:generate`. `prisma`, `@prisma/client` y
  `@prisma/adapter-pg` van fijados a la misma versión. No usar la v8 (release candidate).
- **Generadores que instalan cosas de terceros** (`prisma init`, `create-next-app`...): dejan
  skills o `AGENTS.md` en el repo. No ejecutarlos sin revisar y borrar lo que agreguen.
- **Dockerfile sin corepack** (Node 25+ no lo trae). La versión de pnpm está en `ARG PNPM_VERSION`
  y en `package.json`: mantener las dos iguales.
- `/health` consulta la base de datos: responde 503 si cae. `test:e2e` y `smoke` necesitan Postgres.
- Redis corre en Docker pero **aún no hay cliente** en el código.
- Windows + Git Bash: `MSYS_NO_PATHCONV=1` con `docker run -w`; matar procesos por puerto con
  PowerShell y comprobar que el puerto quedó libre; `pnpm install` no regenera `src/generated/`
  si ya estaba todo instalado.

## Seguridad

- Nunca leer, imprimir ni commitear `.env`. Solo se versiona `.env.example`.
- Acciones de terceros en la CI fijadas por SHA (`pnpm/action-setup`, `gitleaks-action`).
- Una base de datos conectada a una herramienta de IA: solo la local de Docker, nunca producción.

## Contrato con el frontend

- CORS acepta únicamente `FRONTEND_URL` (`http://localhost:3000` en local).
- `GET /health` → `200 {"estado":"ok","baseDatos":"ok"}` o
  `503 {"estado":"error","baseDatos":"caida"}`. El frontend lo valida con Zod.
- Cualquier cambio de forma de una respuesta o evento se coordina en **los dos repos**.
