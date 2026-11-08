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

## Arquitectura (decidida el 2026-11-04)

**Monolito modular con núcleo puro** (puertos y adaptadores en versión ligera) y **un actor por
partida**.

```
src/core/      reglas del juego, TypeScript PURO (hoy: mapa/ con coordenadas y geometría)
src/schemas/   contrato de red con Zod (aún no existe)
src/modules/   entrada: gateways y casos de uso de Nest (health/, luego salas, juego...)
src/infra/     salida: Prisma hoy; Redis y colas después
src/config/    variables de entorno validadas con Zod (falla al arrancar si algo falta)
```

Dependencias permitidas (`→` = "puede importar de"): `modules → core, schemas, infra` ·
`schemas → core` · `infra → core` · `core → nada del proyecto`.

**Las hace cumplir el lint** (`no-restricted-imports` en `oxlint.json`, probado con archivos
buenos y malos):

- `core/` no importa Nest, Prisma, socket.io, Redis ni BullMQ, ni `infra/`, `modules/`,
  `schemas/`, `config/` o `generated/`.
- `infra/` no importa `modules/`.

**Solo por revisión** (el lint no las detecta): un módulo no importa de otro módulo; `core/` no usa
`Math.random` ni `Date.now` (el azar es determinista, con semilla); sin ciclos de importación.

Diseño del juego:

- **Un actor por partida:** cada partida es un objeto en memoria que procesa **una acción a la
  vez** (cola por sala), así no hay carreras. Se guarda una instantánea; Redis se añade para
  reconexión y varias instancias.
- **Flujo de una jugada:** evento → Zod valida la forma → `core` valida las reglas y devuelve el
  estado nuevo (reductor, sin mutar) → se guarda → vista filtrada por jugador → parches por socket.
- **Registro de eventos (event sourcing):** no se hace ahora, pero el diseño no lo impide: se
  añade encima sin reescribir. Definir los eventos antes de escribir el reductor.
- **Alternativas descartadas:** boardgame.io y Colyseus. Traen fases, secretos y reconexión hechos,
  pero imponen su modelo de estado, y este juego tiene mapas dinámicos, de 2 a 12 jugadores,
  comercio asíncrono y temporizadores. Reconsiderar si escribir reconexión y filtrado a mano
  resulta demasiado caro.

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
- Un **puerto** es una arista costera (protege sus 2 vértices), no un vértice suelto. Costa de
  radio R: `12R+6` aristas. Tipos: `GENERICO` (3:1) o un recurso (2:1); sin puerto, 4:1.
- Azar en `core/`: un flujo por tema (`semilla`, `semilla:puertos`...) con `crearRng` de
  `reglas/azar.ts`, para que añadir un tema nuevo no cambie el reparto de los existentes.
- Dos semillas independientes en `GameConfig`: `semillaMapa` (pública, sale en la vista) y
  `semillaAzar` (secreta: dados, mazo, robos). `crearGameConfig` exige ambas y rechaza una
  `semillaAzar` igual o derivada de la del mapa. `core/` no genera entropía: el servidor
  (`modules/`) debe crearla con `crypto.randomBytes`. El atajo `semilla` es solo de tests
  (`configDePrueba` en `estado/pruebas.ts`).
- Eventos de socket en español (`juego:construirCamino`): nombres **provisionales**.

## Trampas conocidas

- **TypeScript fijado en 6** y `@types/node` en 24 (= Node 24). El CLI de Nest no soporta TS 7
  hasta la 7.1. Dependabot ignora esos saltos mayores.
- **pnpm 11 bloquea los scripts de instalación.** Aprobar por nombre en `pnpm-workspace.yaml`
  (`pnpm approve-builds <paquete>`), nunca `--all`.
- **Prisma 7:** la URL va en `prisma.config.ts`, no en el schema. El cliente se genera en
  `src/generated/` (ignorado por git); si falta, `pnpm db:generate`. `prisma`, `@prisma/client` y
  `@prisma/adapter-pg` van fijados a la misma versión. No usar la v8 (release candidate).
- **`pure-rand` 8** (azar con semilla de `core/`): sin export por defecto; se importa por subruta
  (`pure-rand/generator/xoroshiro128plus`, `pure-rand/distribution/uniformInt`). Por defecto
  **muta** el generador; para uso puro envolver con `pure-rand/utils/purify`. La semilla es un
  número: una semilla de texto (`"ANDES-2026"`) hay que convertirla a entero con un hash propio.
  Sustituye a `seedrandom` (sin mantenimiento desde 2022). `Math.random` sigue prohibido en `core/`.
- **Generadores que instalan cosas de terceros** (`prisma init`, `create-next-app`...): dejan
  skills o `AGENTS.md` en el repo. No ejecutarlos sin revisar y borrar lo que agreguen.
- **Dockerfile sin corepack** (Node 25+ no lo trae). La versión de pnpm está en `ARG PNPM_VERSION`
  y en `package.json`: mantener las dos iguales.
- `/health` consulta la base de datos: responde 503 si cae. `test:e2e` y `smoke` necesitan Postgres.
- Redis corre en Docker pero **aún no hay cliente** en el código.
- ConfigModule copia lo validado a `process.env`: en pruebas con varias apps, restaurarlo (ver
  `modules/pruebas-nest.ts` y `cuentas.integracion.spec.ts`).
- Windows + Git Bash: `MSYS_NO_PATHCONV=1` con `docker run -w`; matar procesos por puerto con
  PowerShell y comprobar que el puerto quedó libre; `pnpm install` no regenera `src/generated/`
  si ya estaba todo instalado.

## Seguridad

- Nunca leer, imprimir ni commitear `.env`. Solo se versiona `.env.example`.
- Acciones de terceros en la CI fijadas por SHA (`pnpm/action-setup`, `gitleaks-action`).
- Una base de datos conectada a una herramienta de IA: solo la local de Docker, nunca producción.

## Contrato con el frontend

- CORS (HTTP y socket) acepta únicamente los orígenes de `FRONTEND_URL`: una lista separada por
  comas (`http://localhost:3000` en local; añade `http://<IP-del-PC>:3000` para jugar desde otros
  dispositivos de la casa).
- Salas: `POST /salas`, `POST /salas/:id/unirse`, `GET /salas/:id`, `POST /salas/:id/empezar`
  (`Authorization: Bearer <token>`). `LimiteHttpGuard` responde **429** al pasar de 20 peticiones
  por minuto por IP (el registro de usuarios lo reutilizará).
- Cuentas (`modules/cuentas/`): `POST /cuentas/registro`, `entrar`, `salir`, `recuperar`,
  `contrasena`, `codigos` (regenerar), `GET /cuentas/yo`, `yo/estadisticas`, `codigos`,
  `DELETE /cuentas/yo`. Sesión en la cookie `pioneros_sesion` (HttpOnly, SameSite=Lax); en la base
  solo el SHA-256 del token. Contraseñas con `scrypt`; recuperación con 8 códigos de un solo uso
  (16 caracteres). Diseño y revisión de seguridad en la nota `Diseno-Registro` del vault.
- **Única excepción a «un módulo no importa de otro»:** `JuegoModule` importa `CuentasModule` (solo su
  servicio de sesiones y `OrigenGuard`) para saber quién inició sesión al crear o unirse a una sala.
- Las rutas que usan la cookie llevan `OrigenGuard` (CSRF) **antes** de `LimiteHttpGuard`.
- Detrás de un proxy inverso hay que configurar `trust proxy` con el número exacto de saltos; sin
  eso todos los usuarios comparten IP y el límite de peticiones se vuelve un DoS. Hoy no hay proxy.
- `CODIGO_REGISTRO` (12 caracteres o más) cierra el registro; vacío = abierto.
- Socket.io: `juego:accion` (con acuse) entra; `juego:inicio`, `juego:notificacion` y `juego:error`
  salen. El servidor fija `jugador` desde la sesión. Esquemas Zod en `src/schemas/`. Protocolo
  completo en la nota `Contrato-de-Red` del vault de Obsidian.
- **Sala de espera y portada en vivo:** namespace `/lobby` de socket.io (`LobbyGateway`), sin sondeo. `auth`:
  `{}` mira la portada (`portada:salas` = salas públicas abiertas + resumen); `{ salaId, token? }` mira una
  sala (`sala:estado` = estado público + `conectados`, `sala:cerrada`, `lobby:error` con `SALA_NO_EXISTE` o
  `PETICION_INVALIDA`). Un token que no vale entra como espectador. `SalasService.alCambiar` avisa tras cada
  cambio y el gateway difunde; las acciones (crear, entrar, salir…) siguen por HTTP. Nunca viajan tokens.
- **Un nombre por sala** (sin distinguir mayúsculas ni espacios): repetirlo da **409**. Una **cuenta** que vuelve a
  entrar a la sala donde ya estaba recupera su asiento con un token nuevo (el anterior deja de valer).
- **Revancha:** `POST /salas/:id/revancha` (Bearer de un jugador de esa partida, ya terminada; 409 si no, 401 sin token). El primero crea una sala nueva con las mismas reglas (y es su anfitrión); los demás entran a esa misma sala; pedirla otra vez recupera tu asiento (token nuevo). El mapa sala→revancha vive solo en memoria.
- `GET /health` → `200 {"estado":"ok","baseDatos":"ok"}` o
  `503 {"estado":"error","baseDatos":"caida"}`. El frontend lo valida con Zod.
- Cualquier cambio de forma de una respuesta o evento se coordina en **los dos repos**.
