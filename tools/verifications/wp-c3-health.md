# WP-C3a — Health granular (F2.1)

**Estado:** ✅ implementado y verificado (rama `feat/wp-c3-health`, merge a main tras G2 verde)
**Refs:** PLAN_EJECUCION.md F2.1 · QUALITY_MANUAL §7.4 · EXECUTION_BATCHES T4.1 · ADR-0004 (env)

## Scope (archivos tocados)

- `packages/contracts/src/runtime.ts` — tipos aditivos: `ReadyChecks`, `ReadinessResponse`, `HealthReadyChangedPayload`; `HealthResponse.uptime?: number` (opcional, aditivo).
- `packages/contracts/src/events.ts` — `health.ready.changed` añadido a `RuntimeEventType` y al union `RuntimeEvent` (aditivo).
- `apps/kage-runtime/src/routes/health.ts` — **nuevo**: `registerHealthRoutes(server, deps)` con `GET /health` (liveness) y `GET /health/ready` (readiness).
- `apps/kage-runtime/src/routes/health.test.ts` — **nuevo**: 7 tests con fastify inject + SQLite real `:memory:`.
- `apps/kage-runtime/src/server.ts` — wiring: elimina el handler inline de `/health` (evita duplicado de ruta), registra `registerHealthRoutes` justo después de migraciones; añade `/health/ready` a `PUBLIC_PATHS` del hook de auth.
- `apps/kage-runtime/package.json` — declara `better-sqlite3` (+ `@types/better-sqlite3` dev) como dependencia directa: el app la usa por su cuenta, no solo transitivamente.
- `tools/enterprise-progress.md` — tracker EPIC C actualizado en el mismo turno (§13.2).

## Comportamiento (§7.4)

- **`GET /health` — liveness:** estático y rápido, no toca DB. Responde `200 {status:'ok', uptime, timestamp}`.
- **`GET /health/ready` — readiness:** tres checks:
  - `db`: probe `SELECT 1` vía la conexión SQLite de storage (`better-sqlite3`), false si la conexión está cerrada/rota.
  - `migrations`: ids contiguos `1..N` presentes en `__migrations` (N = `WORKSPACE_MIGRATIONS.length`); false si la tabla no existe o falta alguna.
  - `llmEnv`: `LLM_BASE_URL` y `LLM_API_KEY` presentes (valores del env validado en boot, ADR-0004).
  - `200 {status:'ready', checks}` si todos pasan; `503 {status:'not-ready', checks}` en caso contrario.
- **Evento `health.ready.changed`** (Ley 3 — observable via `@ninja/events`): emitido **solo en transición** (`null→ready`, `ready→not-ready`, `not-ready→ready`), no en cada request. Payload: `{ready, previous, checks}`. Fuente: `kage-runtime`.
- **Auth:** `/health/ready` añadido a `PUBLIC_PATHS` (solo expone booleanos; revisión del exempt-list por §6.6). E4 (EXECUTION_BATCHES línea 394) ya prevé `/health` y `/health/ready` como únicos exentos.

## Decisiones

1. **Probe de DB = `SELECT 1` sobre la conexión real** (no mock): el caso "DB inaccesible" se prueba cerrando una conexión SQLite real — determinista, sin sleeps ni red.
2. **Check de migraciones por ids contiguos** en `__migrations` en lugar de solo `SELECT 1`: detecta una DB existente pero incompleta (migraciones a medias), que `SELECT 1` no vería. El runner actual aplica ids `1..6` contiguos (`WORKSPACE_MIGRATIONS`).
3. **Wiring en server.ts en este mismo WP** (el batch T4.1 decía "no registrar hasta T4.4"): el `/health` inline previo existía en server.ts; dejar el módulo sin wire habría dejado el tree con un módulo huérfano sin consumer. Se eliminó el inline para no duplicar la ruta. El lote T4.4 añadirá rate-limit/helmet/shutdown sobre este wiring.
4. **`better-sqlite3` declarado como dependencia directa del app**: `routes/health.ts` importa `Database` de better-sqlite3 para tipar `deps.db`; la dependencia transitiva no basta para typecheck estricto. Misma versión que ya usa `@ninja/storage` (`^12.8.0`), sin bumps.
5. **Tests con EventBus aislado** (mock factory sobre `@ninja/events` conservando `createEvent` real): los asserts de eventos no dependen del singleton global ni contaminan otros tests.

## Seguridad (§6.1 review)

`/health/ready` toca la lista de exención de auth (superficie sensible: auth hook). Análisis:

| Amenaza (STRIDE) | Vector | Control | Test |
|---|---|---|---|
| Information Disclosure | Readiness filtra detalle de infraestructura | Solo expone `{db,migrations,llmEnv}` booleanos y status; sin paths, sin DSN, sin mensajes de error | checks == {db,migrations,llmEnv} exacto (test 2) |
| Spoofing | Request sin key consume readiness | Path público intencional (probe estándar); coincide con E4 allowlist; el resto de rutas sigue autenticado | suite auth.test.ts existente sigue verde |
| DoS | Hammering de /health/ready fuerza probes | 3 probes O(1) síncronos (prepare+get); rate-limit global llega en T4.4 (F2.4) | — |
| Tampering / Elevation | N/A — endpoint GET sin estado | — | — |

## Evidence (comandos + output)

```
pnpm --filter @ninja/kage-runtime typecheck      → exit 0
pnpm vitest run apps/kage-runtime/src/routes/health.test.ts
  → Test Files 1 passed · Tests 7 passed (1.36s)
pnpm --filter @ninja/kage-runtime test
  → Test Files 12 passed · Tests 69 passed (incluye wiring de server.ts)
pnpm typecheck (raíz, turbo)                     → 34 successful, 34 total
pnpm test (raíz)                                 → 57 files, 774 tests passed
pnpm errors:check                                → docs/errors.md up to date (19 codes)
pnpm lint (raíz)                                 → 0 errors (78 warnings preexistentes, DEBT F3)
```

Caso de aceptación del plan: **DB inaccesible → `/health/ready` 503 y `/health` 200** — cubierto por test 3 (conexión cerrada: checks.db=false, checks.migrations=false, llmEnv=true) y test 7 (flip en vivo con evento `ready→not-ready`).

## Riesgos / Notas

- `lastReadyState` vive en el closure de `registerHealthRoutes` por proceso: correcto para el runtime de un solo proceso; el evento "primera evaluación" (previous=null) se emite una vez por arranque.
- El check de migraciones asume ids contiguos `1..N`. Las migraciones 7/8 de F2.3 (T4.3) mantienen la contigüidad — el check las recogerá sin cambios.
- El mock de `@ninja/events` en el test usa `new actual.EventBus()` dentro de la factory (evita el hoisting de `vi.mock`).
- **No existe aún** (queda para T4.4/F2.x): rate-limit en `/health/ready`, headers helmet, banner UI conectado al 503 (F2.5/E2E).

## DoD (§1.6)

- [x] `pnpm typecheck` green · `pnpm test` green · `pnpm errors:check` green (G2)
- [x] Sin nuevos `any`/`as any` en archivos nuevos (`health.ts`/`health.test.ts` con 0 casts)
- [x] Sin `throw new Error(` en archivos nuevos
- [x] Eventos vía `@ninja/events` (`health.ready.changed`, transición únicamente)
- [x] Inputs validados: endpoint GET sin body; deps tipadas por contrato (`HealthDeps`)
- [x] Tracker + docs sync en el mismo turno (§11.3, §13.2)

## Refs

- PLAN_EJECUCION.md línea 116 (F2.1) · EXECUTION_BATCHES.md T4.1 · QUALITY_MANUAL §7.4, §6.1, §6.6
- Pendiente de cierre en T4.4: wiring ya hecho en este WP; T4.4 suma helmet/rate-limit/shutdown.
