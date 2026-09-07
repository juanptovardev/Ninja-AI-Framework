# WP-C4c — Rate limiting + security headers (F2.6)

**Estado:** ✅ implementado y verificado (rama `feat/wp-c4-security`, merge a main tras G2 verde)
**Refs:** PLAN_EJECUCION.md F2.6 · ADR-0012 · QUALITY_MANUAL §9.2, §9.3, §6.6 · EXECUTION_BATCHES T4.4

## Scope (archivos tocados)

- `apps/kage-runtime/package.json` — **+2 deps runtime**: `@fastify/rate-limit@^11.2.0`, `@fastify/helmet@^13.1.1` (justificación abajo y en ADR-0012).
- `apps/kage-runtime/src/server.ts` — registra `helmet` (CSP off — API/WS, no HTML propio) y `rateLimit` global (100 req/min por `X-Ninja-Key`, fallback `request.ip`) **antes** de CORS/auth (el límite aplica también a no autenticados); `/api/shell/execute` con override route-level 10/min; `errorResponseBuilder` alineado al formato de error del runtime (`code: 'RATE_LIMITED'`).
- `apps/kage-runtime/src/error-handler.ts` — el handler global preserva `statusCode: 429` del plugin (antes caía a 500 como "unhandled") respondiendo `{ statusCode: 429, error: 'Too Many Requests', code: 'RATE_LIMITED', message }` + log warn.
- `apps/kage-runtime/src/__tests__/rate-limit-security.test.ts` — **nuevo**: 4 tests.
- `docs/adr/0012-rate-limit-security-headers.md` — **nuevo** (ADR requerido por §9.2: deps de runtime).
- `tools/enterprise-progress.md` — tracker.

## Justificación §9.2 (resumen — detalle completo en ADR-0012)

| Criterio | @fastify/rate-limit v11 · @fastify/helmet v13 |
|----------|------------------------------------------------|
| **(1) Need** | Token bucket por key con ventanas y override por ruta: ~150+ LoC y edge cases de concurrencia si hand-rolled; ~15 cabeceras de seguridad con matices si manuales. |
| **(2) Alternativas** | Hand-rolled: descartada (superficie de seguridad propia sin auditoría externa). Cabeceras manuales `onSend`: descartada (inventario incompleto). Proxy externo (nginx): viola local-first. |
| **(3) Licencia** | MIT ambas (§9.3 compliant). |
| **(4) Install size** | ~120 KB + ~150 KB (dependen solo de `fastify-plugin`). |
| **(5) Mantenimiento** | Fastify org oficial, activos, peer fastify ^5 (nuestro stack §9.1). |

## Comportamiento

- **Global**: 100 req/min por key (`X-Ninja-Key`; fallback IP en rutas públicas). 101ª → 429 con `x-ratelimit-limit/remaining/reset` y body `{ statusCode: 429, error: 'Too Many Requests', code: 'RATE_LIMITED', message }`.
- **`/api/shell/execute`**: bucket route-level independiente — 10 req/min; la 11ª → 429.
- **Helmet**: `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy`, `X-DNS-Prefetch-Control`… en todas las respuestas (hook onSend, incluidas 429). CSP deshabilitada (justificado en ADR-0012).
- Store in-memory por proceso — suficiente para single-operator local (nota F5: multi-instancia requeriría store compartido).

## Evidence (comandos + output)

```
pnpm vitest run apps/kage-runtime/src/__tests__/rate-limit-security.test.ts
  → Test Files 1 passed · Tests 4 passed
    (101ª request → 429 + RATE_LIMITED · shell 11ª → 429 · headers en 429 · headers en 200 de /health)
pnpm --filter @ninja/kage-runtime test → Test Files 13 passed · Tests 73 passed
pnpm typecheck (raíz)  → 34 successful, 34 total
pnpm test (raíz)       → 65 files, 810 tests passed
pnpm errors:check      → docs/errors.md up to date (19 codes)
pnpm lint              → 0 errors (77 warnings, baseline)
```

Criterio de aceptación del plan: **101ª request → 429** ✓ (test 1, budget global virgen) · **headers X-Content-Type-Options presentes** ✓ (nosniff en 200 y en 429).

## Notas de integración

- El handler global de errores (WP-C1) ahora trata `statusCode 429` como caso conocido: el plugin lanza el error y sin este cambio el cliente recibiría 500. Fix probado por los tests.
- Orden de registro: helmet/rate-limit se registran antes que CORS y auth → cuentan requests no autenticadas (el abuso no necesita credenciales).
- Los tests del archivo comparten presupuesto por IP (inject): el test de la 101ª va primero con budget virgen; helmet se valida en 429 y en una instancia fresca con 200.

## Riesgos / Notas

- Rate limit aplica a `/health` también (100/min holgado para probes locales). Si un monitor externo lo necesita, `allowList` por IP es una línea en un WP futuro (ADR-0012, Alternatives).
- WS upgrade no está rate-limited por este plugin (handshake HTTP sí cuenta si va por una ruta).
- El 429 del plugin no emite evento al bus (los rate-limit events serían ruido a 429/min); el log warn del error-handler deja trazabilidad.

## DoD (§1.6)

- [x] G2 green · `pnpm errors:check` green
- [x] Sin nuevos `any`/`as any` ni `throw new Error(` en archivos nuevos
- [x] Unit/integration tests para el comportamiento nuevo (4)
- [x] ADR-0012 + justificación §9.2 + licencias (MIT) verificados
- [x] Docs/tracker sync en el mismo turno (§13.2)

## Refs

- PLAN_EJECUCION.md F2.6 · EXECUTION_BATCHES.md T4.4 · ADR-0012 · §6.6, §9.2, §9.3
