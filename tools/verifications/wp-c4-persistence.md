# WP-C4b — Persistencia Pulse/Audit (F2.5)

**Estado:** ✅ implementado y verificado (rama `feat/wp-c4-persistence`, merge a main tras G2 verde)
**Refs:** PLAN_EJECUCION.md F2.5 · QUALITY_MANUAL §3 Gate 4, §7 · EXECUTION_BATCHES T4.3 · WP-C4a (orden de shutdown ya contempla el flush)

## Scope (archivos tocados)

- `packages/storage/src/migrations.ts` — `Migration.down?` (aditivo, Gate 4: up AND down) + `revertMigrations(db, migrations)`: revierte la última aplicada con down path en transacción (down + DELETE de `__migrations`), API determinista con `RevertResult { reverted, reason }` (not-found | no-down-path | not-applied), idempotente.
- `packages/storage/src/index.ts` — exporta `revertMigrations` + tipos.
- `packages/workbench/src/migrations/workspace-migrations.ts` — **Migración 7**: `pulse_metrics` (id INTEGER PK AUTOINCREMENT, captured_at, metric, value REAL, context) + índice `idx_pulse_metrics_metric_captured (metric, captured_at)`; down: DROP INDEX + DROP TABLE. **Migración 8**: `audit_log` (id PK AUTOINCREMENT, created_at, actor, action, target, result, detail); down: DROP TABLE.
- `packages/workbench/src/migrate.ts` — script `db:migrate` con **backup Gate 4** del archivo DB antes de aplicar/revertir (`ninja.db.bak-<ts>`) + modo `--down`.
- `packages/trace-ledger/src/repositories/pulse-metric.repository.ts` — **nuevo**: `PulseMetricRepository` (insert, findByMetric desc, findByRange, aggregateByMetric count/avg/min/max, mapRow) estilo `artifact.repository.ts` (BaseRepository).
- `packages/trace-ledger/src/repositories/audit-log.repository.ts` — **nuevo**: `AuditLogRepository` (insert, findByActor, findByRange, mapRow).
- `packages/trace-ledger/src/index.ts` — exporta ambos repos + tipos de fila.
- `packages/pulse-center/src/monitor.ts` — hook opcional `persistMetric` en `PulseMonitorConfig` (inyección, sin import de trace-ledger → sin acoplamiento L2↔L2); persiste `llm_latency_ms`, `llm_tokens_used`, `stability_score`, `context_efficiency_score`; fallo del hook se loguea (sin empty-catch §4.3), nunca rompe el cálculo en memoria.
- `packages/sentinel/src/auditor.ts` — 3er parámetro opcional `AuditPersistence` (inyección); `log()` persiste de inmediato; `persistedIds` evita duplicados entre log() y flush(); `flush()` (usado por `Auditor.stop()` del shutdown registry de C4a) persiste solo entradas no persistidas.
- `apps/kage-runtime/src/server.ts` — composition root: crea ambos repos sobre la misma `db` global y los inyecta (`persistMetric: (entry) => pulseMetricRepo.insert(entry)`, `new Auditor(bus, log, (e) => auditLogRepo.insert(e))`).
- `apps/kage-runtime/src/__tests__/artifacts-anchor-filter.test.ts` — mock de `@ninja/trace-ledger` completado con los 2 repos nuevos (exigido por el import de server.ts).
- `vitest.config.ts` — `hookTimeout: 30000` (hooks que bootan el runtime completo bajo forks paralelos superaban los 10s default de forma intermitente).
- Tests nuevos (5 archivos, 18 tests) + tracker.

## Decisiones

1. **Inyección de repos con hooks estructurales** (no imports directos): `pulse-center` y `sentinel` (ambos L2) no importan `trace-ledger` (L2) — el wiring vive en server.ts (L4). Cumple Directiva de capas y mantiene los packages testables en aislamiento. Los hooks son estructuralmente compatibles con los `insert()` de los repos.
2. **`revertMigrations` revierte SOLO la última** con down path (no todas): comando incremental seguro; iterar `--down` N veces revierte N. Las sin down path se saltan con reason `no-down-path` (migraciones 1..6 legacy quedan intactas).
3. **Snapshot del metric schema de monitor**: se persisten latencia LLM, tokens, stability y context-efficiency — las métricas que el monitor ya calcula. Los scores se guardan en cada recalculo (frecuencia de eventos, no timers).
4. **`persistedIds` en Auditor**: `log()` persiste al instante (better-sqlite3 sync) y `flush()` en stop() solo escribe lo pendiente — cero duplicados documentado con test.
5. **Backup en `db:migrate` siempre** (up y down): Gate 4 §3.1 exige backup antes de aplicar; el down también muta esquema.
6. **Migraciones 7/8 en `WORKSPACE_MIGRATIONS`** (no en un registro aparte): es lo que `server.ts` y `db:migrate` ya ejecutan sobre la DB global; mantiene contigüidad 1..8 que el health check de C3a asume.

## Tests (18 nuevos)

- `packages/storage/src/migrations.test.ts` (4): up→down→up cycle, idempotencia (not-applied), migración sin down (no-down-path), fila de `__migrations` borrada al revertir.
- `packages/workbench/src/migrations/workspace-migrations.test.ts` (1): migraciones 7/8 up crea tablas+índice, down las elimina sin tocar 1..6, re-up re-aplica con ids contiguos.
- `packages/trace-ledger/src/repositories/persistence.repositories.test.ts` (6): insert/query/range/aggregate de ambos repos + roundtrip mapRow.
- `packages/pulse-center/src/monitor-persistence.test.ts` (3): eventos emitidos → filas (`agent.llm.called` → llm_latency_ms/llm_tokens_used/stability_score; `agent.task.completed` → context_efficiency_score); modo legacy sin hook no crashea.
- `packages/sentinel/src/auditor-persistence.test.ts` (4): evento sentinel → fila audit_log; log() inmediato + stop()/flush() idempotente; sin hook → logger-only; hook que lanza → best-effort sin romper auditor.

## Evidence (comandos + output)

```
pnpm vitest run (los 5 archivos nuevos) → Test Files 5 passed · Tests 18 passed
pnpm typecheck (raíz)   → 34 successful, 34 total
pnpm test (raíz)        → Test Files 64 passed (64) · Tests 806 passed (806)
pnpm errors:check       → docs/errors.md up to date (19 codes)
pnpm lint               → 0 errors (77 warnings, baseline)
pnpm db:migrate (DB real ~/.ninja/ninja.db, secuencia Gate 4):
  Gate 4 backup: ~/.ninja/ninja.db.bak-2026-09-07T20-07-31Z
  Applying migration 7: Create pulse_metrics table (WP-C4b / F2.5)
  Applying migration 8: Create audit_log table (WP-C4b / F2.5)   → Applied 2 new migrations
  migrate --down  → Reverted migration 8 · Last migration reverted successfully
  migrate (up)    → Applying migration 8 · Applied 1 new migrations
  migrate (up ×2) → Applied 0 new migrations (idempotente ✓)
```

Criterio de aceptación del plan: **emitir eventos → filas en DB** (monitor-persistence + auditor-persistence tests) · **`pnpm db:migrate` + down + up → idempotente** (verificado sobre la DB real con backup Gate 4).

## Seguridad (§6.1)

`audit_log` persiste decisiones de Sentinel — no es superficie nueva expuesta (escritura local SQLite; lectura solo vía repo interno, sin endpoint HTTP en este WP). `detail`/`context` guardan JSON de payloads ya existentes en el bus; §7.5 (sin secretos en logs) aplica igual que al audit log en memoria.

## Riesgos / Notas

- `hookTimeout` global 30s: solo afecta hooks (beforeAll de suites que bootan servers); el testTimeout sigue 10s.
- Las migraciones 1..6 no tienen down (legacy): revertMigrations las salta con `no-down-path` — revertir el sistema completo no es caso de uso (solo hotfix puntual).
- El endpoint HTTP de consulta de audit/metrics queda para F2.5+ (dashboard pulse) — no en este WP.
- `PulseMetricRepository.findById` heredado de BaseRepository busca por string pero el id es INTEGER — uso documentado: `findByMetric`/`findByRange`/`aggregateByMetric`.

## DoD (§1.6)

- [x] `pnpm typecheck` green · `pnpm test` green · `pnpm errors:check` green (G2)
- [x] Gate 4: up AND down implementados y probados + backup antes de aplicar
- [x] Sin nuevos `any`/`as any` en archivos nuevos
- [x] Sin `throw new Error(` en archivos nuevos
- [x] DB migration DoD: migración test verde, trace-ledger repos en el mismo WP
- [x] Tracker sync en el mismo turno (§13.2)

## Refs

- PLAN_EJECUCION.md F2.5 · EXECUTION_BATCHES.md T4.3 · QUALITY_MANUAL §3.1 (Gate 4), §1.6 (DB migration DoD), §7.5
