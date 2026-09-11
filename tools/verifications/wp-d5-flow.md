# WP-D5 · Verification Dossier — Flow Matrix: paralelismo real + deadlock + estado persistente (T6.6)
**Branch**: `feat/wp-d5-flow` (worktree aislado `wt-e6-t66`, cambios UNCOMMITTED al cierre de este dossier)
**Fecha**: 2026-09-11
**Paquete**: `@ninja/flow-matrix` (+ solo los códigos de error nuevos en `@ninja/contracts`).
**Goal**: convertir `WorkflowExecutor` de secuencial a paralelismo REAL (waves + `Promise.allSettled`
+ límite de concurrencia configurable), deadlock por timeout con `FlowError` (nunca cuelga), estado
persistente recuperable tras un reinicio simulado, eliminación de los 7 `console.warn` (EV-25),
tests con timing real (0 `vi.useFakeTimers`), `0 as any`, `0 throws crudos`, `0 console.*`.

---

## Entregado

### 1. Paralelismo real y acotado
- **`src/graph.ts` (NUEVO)** — `buildExecutionPlan(steps)` → `{ order, waves }`:
  - Kahn topological sort con detección de ciclos → lanza `FlowError(FLOW_CIRCULAR_DEPENDENCY)`
    (comportamiento previo intacto, verificado contra el test de ciclo existente).
  - Profundidad = camino de dependencias más largo; los pasos de la misma profundidad forman una
    **wave** → todos los pasos de una wave son mutuamente independientes.
  - Dependencias fantasma (id inexistente) se ignoran (mismo contrato relajado que antes).
- **`src/concurrency.ts` (NUEVO)** — `runWithConcurrency<T>(tasks, limit)`: pool de workers sobre
  `Promise.allSettled`, resultados ordenados por entrada, límite acotado (`Math.max(1, floor(limit))`).
- **`src/executor.ts` (REWRITE)** — `execute` recorre las waves; cada wave corre con el pool
  acotado por `concurrencyLimit`.

### 2. Deadlock por timeout (nunca cuelga)
- Waves independientes detectadas en `graph.ts` NO pueden tener ciclo estático; el deadlock real es
  **runtime** (pasos que se esperan entre sí dentro de la wave). Por eso el watchdog es por wave:
  `Promise.race([settle, watchdog])` con `setTimeout(deadlockTimeoutMs)` → `FlowError`
  `FLOW_DEADLOCK_TIMEOUT` (`retryable: true`, `httpStatus: 504`, contexto `{ runId, stepIds }`),
  `clearTimeout` en `finally` (sin leaks de timers).
- Estado del run → `failed`, evento `workflow.failed` con error, throw tipado hacia el caller.

### 3. Estado persistente tras reinicio
- **`getRunSnapshot(runId)` (nuevo método público)** — reconstruye `WorkflowState` desde Trace Ledger:
  `runRepository.findById` + `artifactRepository.findByRunId` (filtra prefijo `Step Result: `),
  `safeJsonParse` + guard `isStepResult` (artefactos corruptos → `log.warn` y skip, nunca crash).
  `null` cuando el run nunca se persistió. Prueba de reinicio simulado: dos instancias comparten los
  mismos repositorios mock (backing store con arrays) → la segunda instancia recupera status +
  stepResults via `getRunSnapshot`.

### 4. EV-25 — 7 `console.warn` → logging estructurado
| # | Antes (baseline `HEAD:.../executor.ts`) | Ahora |
|---|-----------------------------------------|-------|
| 1 | `console.warn('Failed to update run status in repository:', error)` | `this.log.warn('Failed to persist run status to the Trace Ledger', {runId, status, error})` |
| 2 | `console.warn('Failed to persist step result as artifact:', error)` | `this.log.warn('Failed to persist step result as artifact', {runId, stepId, error})` |
| 3 | `console.warn('Failed to update final run status in repository:', error)` | unificado en (1) vía `persistStatus` |
| 4 | `console.warn('Failed to update failed run status in repository:', error)` | ídem (1) |
| 5 | `console.warn('Failed to update paused run status in repository:', error)` | ídem (1) |
| 6 | `console.warn('Failed to update resumed run status in repository:', error)` | ídem (1) |
| 7 | `console.warn('Failed to update cancelled run status in repository:', error)` | ídem (1) |

Las escrituras (`persistStatus` / `persistStepArtifact`) se envuelven en `retryWithBackoff`
(`@ninja/common-utils`, `{maxRetries: 1, baseDelayMs: 0, maxDelayMs: 0, jitter: false}`) — reintento
único inmediato y `log.warn` al fallar definitivamente. Logger `createLogger('flow-matrix')`
(`@ninja/logging`). Ambos paquetes son deps `workspace:*` justificadas (reuse-first §TRACE_FUNCIONES).

### 5. Opciones de ejecución y validación
- 4º parámetro opcional del constructor (compatibilidad backwards total con `server.ts:262` que pasa
  solo 3 args): `WorkflowExecutorOptions { concurrencyLimit?: number (default 4), deadlockTimeoutMs?:
  number (default 60_000) }`.
- Validación estricta: no-positivo o no-entero → `FlowError(FLOW_INVALID_OPTIONS)` en el ctor.
- `type WorkflowExecutorOptions` exportado desde `src/index.ts`.

### 6. Códigos de error nuevos (`@ninja/contracts/src/errors.ts`)
- `FLOW_DEADLOCK_TIMEOUT` — domain `flow`, `httpStatus 504`, `retryable true`.
- `FLOW_INVALID_OPTIONS` — domain `flow`, `httpStatus 400`, `retryable false`.
- `docs/errors.md` regenerado (`pnpm errors:docs`, 47 códigos) y `pnpm errors:check` en verde.

---

## Entregados de test (34 → 48 en el área)

### `src/executor.test.ts`
- **`parallel execution`** (reemplaza "sequential execution"):
  1. **Paralelismo REAL por evidencia de eventos**: 3 ramas independientes → las 3 `workflow.step.started`
     emiten ANTES de la primera `workflow.step.completed` (índices de eventos MCP) **y** solapamiento
     temporal en intervalo cerrado (`a0 <= b1 && b0 <= a1`) sobre timestamps reales ISO (no-strict `<=`
     para tolerancia a colisiones de ms).
  2. **Límite de concurrencia respetado**: `concurrencyLimit: 2`, 4 pasos bloqueados en una compuerta
     compartida → `vi.waitFor` hasta `startedNow.length === 2` con la compuerta aún cerrada, tras
     resolver → 4 iniciados y `maxActive === 2`. Timing real, sin sleeps.
  3. **Orden topológico**: cadena `a→b→c` sigue en estricto orden por dependencia.
- **failure propagation**: `'continues executing independent steps after one fails'` ahora espera
  `arrayContaining(['bad', 'after'])` (orden de ramas paralelas no determinista — cambio intencional,
  el comportamiento de "no abortar ramas independientes" se conserva y se fortalece la aserción).
- **pause/resume/cancel**: test de cancel ahora hace `b dependsOn: ['a']` para que `['a']` sea
  determinista bajo paralelismo (antes lo era por orden de declaración secuencial).
- **`deadlock detection`** (NUEVO):
  - Watchdog real: 2 pasos con compuertas cruzadas (s1 espera a gateB, s2 espera a gateA),
    `deadlockTimeoutMs: 60`, `Date.now()` real → `isNinjaError` + `code === FLOW_DEADLOCK_TIMEOUT` +
    `retryable === true` + `elapsed < 2000ms` + estado `failed` + `workflow.failed` emitido.
  - Pasos que nunca resuelven sin ciclo estático → misma señal tipada (cubre "cepillado" entre branches).
- **`persistence across restart`** (NUEVO): backing-store compartido (arrays) + 2 instancias →
  `getState` nulo en la segunda (memoria volátil intacta) pero `getRunSnapshot` recupera status
  `completed` + stepResults `{x, y}` con output. `getRunSnapshot` → `null` para run nunca persistido.
- **`executor options`** (NUEVO): `concurrencyLimit: 0` y `deadlockTimeoutMs: -1` → `FLOW_INVALID_OPTIONS`.

### `src/concurrency.test.ts` (NUEVO, 6 tests)
Pool puro: orden de entrada preservado, límite nunca excedido (compuertas con resolución escalonada),
semántica `allSettled` (rechazo no aborta al resto), lista vacía → `[]`, límite no-positivo → clamp a 1,
spy de rechazo.

---

## Evidencia (re-ejecutable)

### Aceptación 1 — typecheck del paquete
```text
pnpm --filter @ninja/flow-matrix typecheck
> tsc --noEmit
→ exit 0, 0 errores ✅
```

### Aceptación 2 — tests del área flow-matrix
```text
pnpm vitest run packages/flow-matrix
 Test Files  4 passed (4)
      Tests  48 passed (48) ✅   (baseline: 34)
```

### Aceptación 3 — suite completa (regresión)
```text
pnpm test
 Test Files  105 passed (105)
      Tests  1251 passed (1251) ✅   (baseline AGENTS.md: 1174; el delta +77 incluye WPs previos ya en el branch)
```

### Aceptación 4 — `pnpm errors:docs` + `pnpm errors:check`
```text
✅ docs/errors.md generated with 47 error codes.
✅ docs/errors.md is up to date (47 error codes).
```
Filas nuevas en `docs/errors.md`:
`| FLOW_DEADLOCK_TIMEOUT | flow | 504 | ✅ | … |` / `| FLOW_INVALID_OPTIONS | flow | 400 | ❌ | … |`

### Aceptación 5 — cero `console.*` en producción
```text
git grep -n "console\." -- packages/flow-matrix/src   (excl. *.test.ts)
→ 0 matches ✅
```

### Aceptación 6 — cobertura
```text
pnpm vitest run --coverage
 Test Files  105 passed (105) | Tests 1251 passed ✅
 flow-matrix/src | % Lines 98.11 (antes 95.48) | % Stmts 95.72 | % Funcs 100 | % Branch 78.7 ✅ (umbral 70)
→ ÚNICOS umbrales rojos: kage-engine 63.42% (<70) y vault 36.74% (<70) — deudas PRE-EXISTENTES ajenas
  a este WP (ver wp-d2-thresholds.md); flow-matrix cumple su bloque.
```
(detalle por archivo: `executor.ts` 96.63% lines · `graph.ts` 100% lines · `concurrency.ts` cubierto por
sus 6 tests unitarios.)

### Aceptación 7 — build
```text
pnpm --filter @ninja/flow-matrix build   → tsup cjs+esm+dts success ✅
pnpm --filter @ninja/contracts build      → success ✅ (warn pre-existente de conditions en package.json)
```

### Aceptación 8 — alcance
```text
git status --short :
 M docs/errors.md, packages/contracts/src/errors.ts, packages/flow-matrix/{package.json,
   src/executor.test.ts, src/executor.ts, src/index.ts}, pnpm-lock.yaml
 ?? packages/flow-matrix/src/{concurrency.test.ts, concurrency.ts, graph.ts}
→ Sin archivos fuera de alcance ✅
```

---

## Cambios de test INTENCIONALES (justificados)
1. `'runs steps strictly in declaration order'` (independientes) → **reemplazado** por el test de
   paralelismo real (eventos + timestamps). Era la aserción del comportamiento secuencial que WP-D5
   elimina; su equivalente determinista (orden topológico) se conserva para cadenas dependientes.
2. `'continues executing independent steps after one fails'`: `toEqual(['bad','after'])` →
   `arrayContaining(...)`. Bajo ejecución paralela el orden de 2 ramas independientes no es
   determinista; el contrato ("continúa tras un fallo") se refuerza.
3. Test de cancel: `b` pasa a depender de `a` para que `['a']` sea determinista sin depender del orden
   de declaración.

## Dead code (LISTADO — NO borrado, regla del slot)
- Ninguno introducido en este WP. Las piezas secuenciales eliminadas (`runSequentially`, bucles
  `for await`) se reemplazaron por sus equivalentes paralelos, no quedan consumidores huérfanos.

## Desviaciones / deviations
- **Ninguna estructural.** Las únicas "menciones" fuera de `packages/flow-matrix` son los 2 códigos de
  error en `@ninja/contracts/src/errors.ts` + `docs/errors.md` regenerado (ambos en la lista del slot.
  de T6.6) y `pnpm-lock.yaml` (2 deps `workspace:*` de paquetes ya existentes, sin deps nuevas de terceros).

## FUERA DE ALCANCE (no tocado)
`apps/*`, resto de `packages/*` (fuera de lo listado), sentinel, thresholds de cobertura globales,
deudas kage-engine/vault, `server.ts` (wiring sin cambios — constructor backwards-compatible), E2E.

## Files created / modified
- CREATED `packages/flow-matrix/src/graph.ts` — plan de ejecución (topo + waves)
- CREATED `packages/flow-matrix/src/concurrency.ts` — pool acotado `runWithConcurrency`
- CREATED `packages/flow-matrix/src/concurrency.test.ts` — 6 tests del pool
- REWRITTEN `packages/flow-matrix/src/executor.ts` — waves paralelas + watchdog + `getRunSnapshot` + logger
- MODIFIED `packages/flow-matrix/src/executor.test.ts` — 34 → 48 tests (paralelismo, límite, deadlock, persistencia, opciones)
- MODIFIED `packages/flow-matrix/src/index.ts` — exporta `type WorkflowExecutorOptions`
- MODIFIED `packages/flow-matrix/package.json` — deps `@ninja/common-utils` + `@ninja/logging` (workspace:*)
- MODIFIED `packages/contracts/src/errors.ts` — +`FLOW_DEADLOCK_TIMEOUT`, +`FLOW_INVALID_OPTIONS`
- MODIFIED `docs/errors.md` — regenerado (47 códigos)
- MODIFIED `pnpm-lock.yaml` — 2 workspace deps de paquetes existentes
- CREATED `tools/verifications/wp-d5-flow.md` (este dossier)