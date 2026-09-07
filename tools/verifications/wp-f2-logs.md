# WP-F2.7 — Logs JSON estructurados (Manual §7)

**Estado:** ✅ implementado y verificado (rama `feat/wp-f2-logs`, merge a main tras G2 verde)
**Refs:** PLAN_EJECUCION.md F2.7 · QUALITY_MANUAL §7.1 (formato), §7.2 (correlación), §11.3 (docs-code sync) · troubleshooting.md (drift histórico resuelto)

## Scope (archivos tocados)

- `packages/logging/src/logger.ts` — modo de salida **JSON 1-evento/línea** (JSONL): `{ts, level, logger, msg, ...context, err?, args?}`. Campos reservados (`ts/level/logger/msg`) no sobrescribibles por contexto. `Error` → `{err: {name, message, stack}}`. Primitivos extra → `args`. Formato configurable: `NINJA_LOG_FORMAT=json|pretty` + `setGlobalLogFormat()`; **auto**: pretty si TTY (dev), json si no (12-factor). Pretty mode legacy intacto.
- `packages/logging/src/index.ts` — exporta `setGlobalLogFormat`/`getGlobalLogFormat` + tipo `LogFormatSetting`.
- `apps/kage-runtime/src/request-logging.ts` — **nuevo**: plugin Fastify — `onRequest` marca `correlationId = request.id` y timer `hrtime`; `onResponse` emite access log mínimo `msg: "METHOD url STATUS"` con `{correlationId, method, url, statusCode, durationMs, remoteAddress}` vía `@ninja/logging`. `skipPaths` para `/health` (probe ruidoso).
- `apps/kage-runtime/src/server.ts` — `fastify({ genReqId: () => crypto.randomUUID() })` (correlationId por request, §7.2) + `registerRequestLogging(server, { skipPaths: ['/health'] })`. `logger:false` se mantiene (el logging propio cubre todo — no pino).
- `apps/kage-runtime/src/__tests__/request-logging.test.ts` — **nuevo**: 3 tests.
- `packages/logging/src/logger.test.ts` — **nuevo**: 8 tests.
- `docs/user/troubleshooting.md` — formato real documentado (campos obligatorios, err, correlationId, NINJA_LOG_FORMAT, LOG_LEVEL, grep por level y por correlationId). Era el drift conocido §7.1 — ahora docs = código (§11.3).
- `tools/enterprise-progress.md` — tracker.

## Comportamiento (§7.1)

```json
{"ts":"2026-09-07T20:00:00.000Z","level":"info","logger":"kage-runtime:access","msg":"GET /api/status 200","correlationId":"0f1e...","method":"GET","url":"/api/status","statusCode":200,"durationMs":1.24,"remoteAddress":"127.0.0.1"}
```

- Campos obligatorios SIEMPRE presentes: `ts` (ISO 8601) · `level` · `logger` · `msg`.
- Correlación: `correlationId` (UUID por request vía `genReqId`) en cada access log y disponible para handlers (`request.id`). §7.2 al nivel de HTTP; propagación a Trace Ledger es F2.x posterior.
- Niveles: debug/info/warn/error — error/warn a stderr (console.error/warn), resto stdout.
- Pretty en TTY dev se conserva (colorize + prefix legacy) — requisito del WP.

## Decisiones

1. **Formato en `@ninja/logging`, no en Fastify pino**: el Manual §7.1 pide formato propio del sistema; el paquete es la única fuente de logging (todos los módulos ya usan `createLogger`). `fastify logger:false` se mantiene y el access log lo emite el plugin propio — un solo formato, un solo punto de cambio.
2. **Campos reservados ganan**: un contexto con `level: 'critical'` no puede falsificar una línea — guard test incluido.
3. **`skipPaths: ['/health']`**: liveness probe genera ruido a cada check del orquestador; readiness (`/health/ready`) SÍ se loguea (útil para diagnosticar flips).
4. **`durationMs` con `hrtime.bigint()`**: precisión sub-ms sin depender de `Date.now()` monotónico.
5. **`NINJA_LOG_FORMAT` env** (no en EnvSchema): es variable de presentación de logs, no config del runtime; decidida así para no forzar re-validación de env en tests. Documentada en troubleshooting. (Nota: si el owner prefiere añadirlo a `EnvSchema`, es cambio de 2 líneas.)
6. **No se tocan los loggers existentes de módulos** (`kage-runtime:server`, `storage`, `engram`…): el cambio de formato es automático porque todos pasan por `@ninja/logging`.

## Tests (11 nuevos)

**logger.test.ts (8)**: línea JSON parsea con ts/level/logger/msg exactos · contexto en el mismo nivel + Error → err{name,message,stack} · campos reservados protegidos · JSONL estricto (1 evento/línea, `\n` escapado) · minLevel respeta formato · auto→json sin TTY · pretty forzado mantiene formato legacy · primitivos → args.

**request-logging.test.ts (3)**: access log JSON con `msg "GET /api/status?foo=bar 200"`, correlationId UUID, durationMs, remoteAddress · `/health` excluida y `/api/status` no · correlationIds distintos por request.

Criterio del plan: **log capturado parsea como JSON con campos obligatorios** ✓ (test 1 de logger.test.ts es literalmente ese caso).

## Evidence (comandos + output)

```
pnpm vitest run packages/logging/src/logger.test.ts → 8 passed
pnpm vitest run apps/kage-runtime/src/__tests__/request-logging.test.ts → 3 passed
pnpm typecheck (raíz) → 34 successful, 34 total
pnpm test (raíz)      → 67 files, 821 tests passed
pnpm errors:check     → docs/errors.md up to date (19 codes)
pnpm lint             → 0 errors (77 warnings, baseline)
```

## Riesgos / Notas

- Salida JSON en no-TTY cambia lo que ve quien corre `pnpm runtime:dev` en terminal (TTY → pretty, sin cambio visual). CI/scripts/pipes reciben JSON — mejora, pero es el cambio visible de este WP.
- `dossiers` y tests que parseaban el formato legacy con regex (`INFO`) no existen — verificado: 821 tests verdes sin ajustes adicionales.
- correlationId aún no se propaga a eventos del bus ni a Trace Ledger artifacts (§7.2 completo) — anotado como siguiente paso natural (F2.x).
- Engram client y otros packages L1 heredan el formato automáticamente vía createLogger — sin cambios.

## DoD (§1.6)

- [x] `pnpm typecheck` green · `pnpm test` green · `pnpm errors:check` green (G2)
- [x] Sin nuevos `any`/`as any` ni `throw new Error(` en archivos nuevos
- [x] Tests para el comportamiento nuevo (11)
- [x] Docs actualizadas en el mismo turno (§11.3): troubleshooting.md = formato real
- [x] Sin creep: sin endpoint nuevo, sin cambio de API pública salvo exports nuevos de logging

## Refs

- PLAN_EJECUCION.md F2.7 · QUALITY_MANUAL §7.1, §7.2, §11.3 · troubleshooting.md (drift §7.1 cerrado)
