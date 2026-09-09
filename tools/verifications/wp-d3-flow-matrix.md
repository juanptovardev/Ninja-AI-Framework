# WP-D3 · T5.1 — Tests de flow-matrix (executor coverage)

**Estado:** ✅ implementado y verificado (rama `feat/wp-d3-fm`, worktree `ninja-t51`)
**Refs:** PLAN_EJECUCION.md T5.1 (prompt congelado) · QUALITY_MANUAL §5 (normas anti-suite-basura) · slot `wt-1`

## Scope (archivos tocados)

- `packages/flow-matrix/src/registry.test.ts` — **nuevo**: 6 tests de `WorkflowRegistry` (register/get/overwrite/list/unregister/unknown).
- `packages/flow-matrix/src/step-runner.test.ts` — **nuevo**: 7 tests de `StepRunner` (resultado completado con timing, orden de eventos started→completed, payloads de eventos con workflowId/runId/stepId/source, captura de fallo con mensaje de error, evento `workflow.step.failed` en vez de completed, timeout con fake timers, limpieza del timer al resolver a tiempo).
- `packages/flow-matrix/src/executor.test.ts` — **nuevo**: 21 tests de `WorkflowExecutor` (orden secuencial, orden topológico con dependencias declaradas fuera de orden, dependencias fantasma ignoradas, mapa `stepResults` + memoria final, workflow de 0 steps, colección de fallos con mensaje, continuación tras fallo, persistencia de artefactos con `StepResult` serializado, tolerancia a fallo de repositorios, ciclo → `workflow.failed` + rethrow, orden completo de eventos, estado final failed en `workflow.completed`, transiciones de status en Trace Ledger, pause/resume/cancel sobre running/paused con eventos y persistencia, cancel mid-ejecución salta steps restantes, no-ops de pause/resume/cancel sin estado, `getState` desconocido).
- `tools/verifications/wp-d3-flow-matrix.md` — este dossier.

Nada más. Sin cambios en código fuente de producción del paquete.

## Cobertura (criterio de aceptación: lines ≥70%)

Comando: `pnpm vitest run packages/flow-matrix --coverage`

```
File            | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
----------------|---------|----------|---------|---------|-------------------
flow-matrix/src |   96.15 |    84.21 |     100 |   96.12 |
  executor.ts   |   95.41 |    81.63 |     100 |   95.37 | 112,182,221,256,292
  registry.ts   |     100 |     100  |     100 |     100 |
  step-runner.ts|     100 |     100  |     100 |     100 |
  schema.ts     |      —  |     —    |     —   |      —  | (excluido por vitest.config.ts)
  index.ts      |      —  |     —    |     —   |      —  | (excluido por vitest.config.ts)

Test Files  3 passed (3)
Tests       34 passed (34)
Statements  : 96.15% ( 125/130 )
Branches    : 84.21% ( 48/57 )
Functions   : 100%   ( 23/23 )
Lines       : 96.12% ( 124/129 )   ← ≥70% ✓
```

Nota: el reporte global del comando (sin `--coverage.include`) lista todos los paquetes del monorepo a 0% — es el alcance configurado en `vitest.config.ts` (`include: ['packages/*/src/**/*.ts']`), no un fallo de este WP. El número relevante para aceptación es el de `flow-matrix/src`: **96.12% lines**.

## Decisiones

1. **Retry**: el prompt pide cubrir "configuración de retry", pero `flow-matrix` **no implementa reintentos** (grep sobre `src/*` confirma: no hay `retry`/`maxRetries`/`attempt` en el código). Inventar tests de una feature inexistente violaría la norma anti-suite-basura (§5) y el alcance "no improvisar". Se reporta como gap del módulo (no del test): la implementación de retry corresponde a un WP posterior si el Plan Maestro lo requiere. `WorkflowStep.timeout` sí existe y está cubierto (2 tests con fake timers).
2. **Estados paused/cancelled**: `pause`/`resume`/`cancel` solo actúan cuando el estado interno es `running`/`paused`. Los tests usan gates deterministas (promises diferidas + `vi.waitFor`) para invocarlos dentro de la ventana real de ejecución, sin sleeps ni dependencia de orden.
3. **`MockEventBus` de `tests/helpers`** (ya trackeado en este worktree) para todas las emisiones; cast `as unknown as EventBus` siguiendo el patrón existente de `packages/kage-engine/src/coordinator.test.ts:110`. Los errores de `console.warn` por fallo de repositorio mockeado son comportamiento esperado del executor (tolerancia a fallos de Trace Ledger) y están asertados como "no aborta el workflow".
4. **Cancel mid-execution**: se verifica desde dentro del handler (única ventana donde el estado es `running`): tras `cancel`, el step restante `b` no se ejecuta y `stepResults['b']` queda `undefined`.

## Evidence (comandos + output)

```
pnpm vitest run packages/flow-matrix --coverage
  → Test Files 3 passed (3) · Tests 34 passed (34)
  → flow-matrix/src: Lines 96.12% (124/129) · Branches 84.21% · Funcs 100%

pnpm --filter @ninja/flow-matrix typecheck → exit 0
pnpm prettier --check packages/flow-matrix/src/*.test.ts → All matched files use Prettier code style!
```

## DoD (Quality Manual)

- [x] Nombres nativos respetados (Flow Matrix, Trace Ledger)
- [x] Sin scope creep en paquetes hermanos (solo `packages/flow-matrix/**` + dossier)
- [x] Tests emiten/consumen vía eventBus (mock trackeado), sin red, sin DOM, sin sleeps reales (fake timers en step-runner)
- [x] Cobertura lines 96.12% ≥ 70%
- [x] Typecheck del paquete verde
- [x] Dossier con evidencia pegada
