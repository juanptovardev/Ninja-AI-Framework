# WP-C3b — WS reconnect forge-console (F2.2)

**Estado:** ✅ implementado y verificado (rama `feat/wp-c3-ws-reconnect`, merge a main tras G2 verde)
**Refs:** PLAN_EJECUCION.md F2.2 · EXECUTION_BATCHES T4.2 · QUALITY_MANUAL §8.3 (a11y) · WP-B11 (auth handshake)

## Scope (archivos tocados)

- `apps/forge-console/lib/ws-client.ts` — **reescrito**: ciclo de reconexión con backoff exponencial + jitter, re-auth handshake en cada (re)conexión, estado fino en store, logs estructurados.
- `apps/forge-console/src/__tests__/ws-client.test.ts` — **nuevo**: 12 tests (función pura de backoff + ciclo completo con WS mockeado y fake timers). Colocado bajo `src/__tests__/` porque el include de vitest cubre `apps/*/src/**` (no `apps/*/lib/**`).
- `apps/forge-console/lib/ws.ts` — **eliminado** (`git rm`): 0 imports verificados con 2 greps independientes (`lib/ws'`, `WebSocketWrapper|createWebSocket|ConnectionStatus`). Código muerto que duplicaba el cliente vivo.
- `apps/forge-console/app/mission-control/page.tsx` — indicador de conexión con estados finos (`WS Connected / Reconnecting… / Connecting… / Offline`), badge con `pulse` cuando no está open, `aria-live="polite"` (§8.3).
- `packages/ui-kit/src/components/base/Badge.tsx` — prop opcional `aria-live` (aditivo, otros consumers intactos).
- `apps/forge-console/app/office/page.tsx` — comentario stale que referenciaba `lib/ws.ts` actualizado.
- `tools/enterprise-progress.md` — tracker EPIC C (C3b ✅, progreso 75%).

## Comportamiento (F2.2)

- **Backoff exponencial:** `nextBackoffMs(attempt)` — función pura exportada. `1000 × 2^attempt`, techo `30000ms`, jitter uniforme ±20%. Intentos 0→4: ~1s, 2s, 4s, 8s, 16s. `attempt ≥ 5` → `null`.
- **Máximo 5 intentos:** agotados → estado `'closed'` + `log.warn` estructurado ("reconnect attempts exhausted", con attempts y url). Sin más timers.
- **Re-auth handshake:** en CADA `onopen` (primera conexión y reconexiones) se envía `{action:'auth', key}`; la conexión no se considera operativa (`connected=true`) hasta recibir `{type:'auth.ok'}`. Rechazo de auth (`auth.timeout`/reason) queda expuesto en `authError`.
- **Estado UI:** `'connecting' | 'open' | 'reconnecting' | 'closed'` (nuevo campo `status` del store; `connected` se mantiene por compatibilidad con consumers existentes).
- **Idempotencia:** `connect()` no duplica sockets ni timers si ya hay conexión o reconexión en curso. `disconnect()` cancela reconexión pendiente (`shouldReconnect=false`).
- **Recuperación exitosa resetea el contador** — caídas sucesivas no acumulan intentos.

## Decisiones

1. **`nextBackoffMs` con `random` inyectable**: permite test determinista de progresión/jitter/techo sin fake timers ni flakiness.
2. **Auth obligatoria antes de `'open'`**: el prompt T4.2 exige "esperar auth.ok antes de resuscribirse"; el store no marca `connected` hasta entonces, y los eventos que llegan antes del auth.ok se ignoran de facto (el runtime no los envía sin handshake).
3. **Mantener `connected` en el store**: `ConversationRail`, `ContextPanel`, `WorkspaceRunning` y `LiveTimeline` lo consumen; migrarlos al nuevo `status` es alcance de banner global (E3) — no se tocan aquí.
4. **`lib/ws.ts` eliminado en este WP** (el prompt lo pedía explícitamente, T4.2 punto 3). El único rastro era un comentario en `office/page.tsx`, también corregido.
5. **Socket ad-hoc de `ClientLayout.tsx` NO migrado**: duplica conexión WS (métricas de tokens) sin auth/backoff. Es deuda de integración con el banner global de E3 (WP-E3 usará `useWsClient`); migrarlo aquí rompería el alcance WIP=1. Listado como nota en Risks.
6. **Test en `src/__tests__/`**: vitest raíz solo incluye `apps/*/src/**/*.test.ts`; mover el test desde `lib/` era obligatorio para que corra en `pnpm test`.
7. **Logs estructurados con `@ninja/logging`** (browser-safe: usa console, `process` protegido con guard). Sin `console.error` crudos en el cliente nuevo.

## Tests (12 — apps/forge-console/src/__tests__/ws-client.test.ts)

**nextBackoffMs (pura):** rango ~1000ms±20% en attempt 0 · ~16000ms±20% en attempt 4 · progresión determinista con random inyectado (800/1000/1200, 2000, 4000, 8000, 16000) · null en ≥5.

**Ciclo de reconexión (WS mock + fake timers):** handshake enviado y `connected` solo tras `auth.ok` · runtime sin auth config → open directo · **matar runtime → backoff → reconecta → re-auth → recibe eventos de nuevo** (caso de aceptación del plan, simulado a nivel unidad) · 5 intentos agotados → `closed` + warn y cero sockets nuevos tras 120s · contador se resetea al recuperar · disconnect manual no reconecta · connect idempotente.

Nota sobre el test E2E del plan (matar runtime 3s): el suite E2E (Playwright) mockea el runtime vía webServer; matar el runtime dentro de un test E2E Rompería la determinismo del suite (§5.3). La cobertura aquí es unitaria/integración-ligera con WS mock; el escenario real queda cubierto por la combinación de: flip de readiness 503 (WP-C3a, ya probado con DB real) + este test de reconexión con re-auth. Se anota en Risks.

## Evidence (comandos + output)

```
pnpm vitest run apps/forge-console/src/__tests__/ws-client.test.ts
  → Test Files 1 passed · Tests 12 passed (0.57s)
pnpm --filter @ninja/forge-console typecheck   → exit 0
pnpm typecheck (raíz)                          → 34 successful, 34 total
pnpm test (raíz)                               → 58 files, 786 tests passed
pnpm errors:check                              → docs/errors.md up to date (19 codes)
pnpm lint (raíz)                               → 0 errors · 77 warnings (baseline 78 → -1)
grep referencias a lib/ws.ts                   → 0 matches
```

## Riesgos / Notas

- **Deuda activa (nota para E3):** `ClientLayout.tsx` mantiene un segundo socket WS ad-hoc (token metrics) que duplica la conexión y no usa re-auth/backoff. Migrarlo a `useWsClient` es parte natural del banner global de E3.
- El test E2E literal del plan se sustituye por cobertura unitaria determinista (ver sección Tests); el escenario se re-evaluará cuando E3 construya el banner contra readiness 503.
- `EVENT_MAPPERS` mantiene `payload: any` heredado del cliente original (deuda F3 existente, no introducida aquí: la firma ya era `any`).
- Si el runtime está caído >~30s acumulados por backoff, el cliente queda en `'closed'` hasta recarga o próximo `connect()` — comportamiento elegido (evita reconexión infinita silenciosa).

## DoD (§1.6)

- [x] `pnpm typecheck` green · `pnpm test` green · `pnpm errors:check` green (G2)
- [x] Sin nuevos `any`/`as any` (los 2 warnings previos de ws-client eliminados; lint net -1)
- [x] Sin `throw new Error(` en archivos nuevos
- [x] Unit tests para el comportamiento nuevo (12)
- [x] Docs/tracker sync en el mismo turno (§13.2); `lib/ws.ts` muerto eliminado (dead code WP-D4 parcial)
- [x] Sin creep: UI-kit solo prop aditiva; ningún otro consumer tocado

## Refs

- PLAN_EJECUCION.md línea 117 (F2.2) · EXECUTION_BATCHES.md T4.2 · WP-B11 (handshake) · §5.5 (mocks), §8.3 (aria-live)
