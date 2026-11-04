## Qué cambia

<!-- Resumen corto del cambio y por qué. -->

## Cómo se probó

- [ ] `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde
- [ ] Tests nuevos o actualizados para el cambio
- [ ] Probado a mano (si aplica)

## Arquitectura

- [ ] Respeta las capas: `core/` sigue siendo TypeScript puro y el lint de capas pasa
- [ ] Un módulo no importa de otro módulo; no hay `Math.random` ni `Date.now` en `core/`

## Seguridad

- [ ] Sin secretos ni credenciales en el código
- [ ] Entradas externas validadas (Zod)
