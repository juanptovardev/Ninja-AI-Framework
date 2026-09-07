# WP-C4a — Shutdown completo ordenado (F2.4)

**Estado:** ✅ implementado y verificado (rama `feat/wp-c4-shutdown`, merge a main tras G2 verde)
**Refs:** PLAN_EJECUCION.md F2.4 · QUALITY_MANUAL §3 (Gate), §7.4 · EXECUTION_BATCHES T4.4 (parte de wiring)

## Scope (archivos tocados)

- `apps/kage-runtime/src/shutdown-registry.ts` — **nuevo**: registro ordenado de pasos de cierre, módulo sin dependencias (evita ciclos server↔lifecycle). API: `registerShutdownStep(name, close)` / `getShutdownSteps()` / `clearShutdownSteps()`.
- `apps/kage-runtime/src/lifecycle.ts` — `shutdown()` ejecuta los steps del registry en orden tras cerrar WS/HTTP; **tolerante a fallos por paso** (catch individual + log, la DB siempre llega a cerrarse); retorna `string[]` con los pasos ejecutados; timeout total 10s con forced exit (`unref`) intacto.
- `apps/kage-runtime/src/server.ts` — registra 5 steps en el orden del plan tras crear los componentes; **elimina el hack `(server as any).failoverManager`** (2 instancias de `as any` menos); `clearShutdownSteps()` al inicio de `createServer()` para idempotencia en tests.
- `packages/sentinel/src/auditor.ts` — `Auditor.stop()` (guarda subscriptions y las cancela — antes quedaban huérfanas) + `flush()` (persistencia de entradas al logger estructurado; la persistencia a SQLite llega en F2.5/WP-C4b con la tabla `audit_log`).
- `tests/integration/runtime-shutdown-order.test.ts` — **nuevo**: 2 tests de integración con boot real.
- `tools/enterprise-progress.md` — tracker EPIC C actualizado.

## Orden de cierre resultante (§3.1 plan)

```
runtime.stopping (evento)
  1. WS + HTTP         → server.close() (Fastify cierra conexiones WS abiertas)
  2. failover-manager   → FailoverManager.stop()
  3. pulse-monitor      → PulseMonitor.stop() (intervals/subscripciones)
  4. sentinel-auditor   → Auditor.stop() (unsubscribe + flush de entradas)
  5. engram-warm-memory → EngramClient.close() (cierra su propia SQLite WARM)
  6. sqlite-db          → closeDb(db) — ÚLTIMA (main storage)
bus listeners dispose → runtime.stopped (evento) → eventBus.clear()
```

Timeout total: 10s con forced exit (`process.exit(1)`, timer `unref`) — preexistente, conservado.

## Decisiones

1. **Registry explícito vs LIFO automático**: el orden del plan es semántico (WS→HTTP→servicios→memoria→DB última), no el inverso de la creación. `registerShutdownStep` en orden de registro expresa esa secuencia en un solo bloque legible en `server.ts`.
2. **Tolerancia a fallos por paso**: un step que lanza no bloquea el resto — el criterio "cada cierre en orden + DB cerrada" manda sobre "fallar rápido". El error queda logueado con el nombre del step.
3. **`shutdown()` retorna `string[]`** (antes `void`): el test integra la assertion de orden sin depender de parsear logs; cambio aditivo (callers existentes ignoran el retorno).
4. **Auditor flush hoy = logger estructurado**: la tabla `audit_log` no existe todavía (F2.5 la crea). El flush ya está cableado en el orden correcto (antes de cerrar DB); F2.5 conectará el repositorio ahí sin tocar el orden.
5. **Executor/pool**: `AgentExecutor` no expone pool global ni `stopAll` (solo `stop(instanceId)` por instancia). Los runs activos mueren con el proceso tras cerrar HTTP (no hay timers en el executor). Se documenta aquí como decisión — no se inventa una API de pool solo para el shutdown.
6. **WAL huérfano**: `closeDb` sobre la última conexión provoca checkpoint y limpieza del `-wal` (comportamiento SQLite). El test lo verifica re-abriendo la DB global tras el shutdown e íntegra `__migrations`.

## Evidence (comandos + output)

```
pnpm vitest run tests/integration/runtime-shutdown-order.test.ts
  → Test Files 1 passed · Tests 2 passed (14.3s) — boot real, orden exacto, WAL íntegro
pnpm vitest run tests/integration/runtime-shutdown.test.ts tests/integration/runtime-lifecycle.test.ts
  → 2 passed (tests F1.6 previos siguen verdes con la firma nueva)
pnpm typecheck (raíz)  → 34 successful, 34 total
pnpm test (raíz)       → 59 files, 788 tests passed
pnpm errors:check      → docs/errors.md up to date (19 codes)
pnpm lint              → 0 errors (77 warnings, sin incrementos; -2 as any heredados)
```

Criterio de aceptación del plan: **shutdown → log de cada cierre en orden + DB cerrada limpio (sin WAL huérfano)** — cubierto por test 1 (orden + logs) y test 2 (DB re-abrible, WAL checkpointed).

## Riesgos / Notas

- En test de integración el boot usa la DB global real (`~/.ninja/ninja.db`): cerrar nuestra conexión no invalida conexiones de otros test files en paralelo (cada handle SQLite es independiente) — verificado: suites de runtime en paralelo siguen verdes.
- `Guardian` no tiene `stop()`: sus subscripciones se limpian con `eventBus.clear()` al final del cierre (aceptable; cambiarlo es creep).
- F2.5 (WP-C4b) añadirá la persistencia real de `audit_log`/`pulse_metrics` — el orden del registry (auditor ANTES de sqlite-db) ya la contempla.
- `shutdown()` emitido dos veces seguidas: los steps se limpian tras ejecutarse (`clearShutdownSteps`), segundo call es idempotente en steps; serverInstance ya null.

## DoD (§1.6)

- [x] `pnpm typecheck` green · `pnpm test` green · `pnpm errors:check` green (G2)
- [x] Sin nuevos `any`/`as any` — **2 eliminados** (hack de failoverManager)
- [x] Sin `throw new Error(` en archivos nuevos
- [x] Tests de integración para el comportamiento nuevo (2)
- [x] Eventos vía `@ninja/events` (stopping/stopped intactos)
- [x] Docs/tracker sync en el mismo turno (§13.2)

## Refs

- PLAN_EJECUCION.md línea ~119 (F2.4) · EXECUTION_BATCHES.md T4.4 · QUALITY_MANUAL §3.1, §7.4
