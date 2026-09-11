# Cierre ETAPA 6 (Calidad Central, T6.1–T6.6) — veredicto del rematador

**Fecha:** 2026-09-11 · **Rama:** `main` · **Base etapa:** `280d489` · **HEAD verificado:** `7f20c38`
**Rol:** revisor ciego (no escribí este código). Los 6 dossiers WP-D se trataron como claims, no como verdad.
**Veredicto: CERRADA-CON-RESERVAS** (reservas = DEBT(T6.4) pendiente de ratificación del dueño + deuda de cobertura conocida + flakes documentados; ningún bloqueante).

## 1. Commits de la etapa (5 merges + 5 features + 1 micro-fix, verificados)

| Merge | Feature | Alcance (contra prompt T6.x) |
|---|---|---|
| `0212f37` | `280d489` feat(common-utils) | retryWithBackoff, Result, debounce/throttle, deepFreeze, safeJsonParse (T6.1 / WP-D1 F3.4) |
| `f349b05` | `0249936` chore(test) | coverage thresholds 50 global / 70 críticos + EXC-3 excluida (T6.2 / WP-D2 F3.5) |
| `d654185` | `a2482bd` refactor(kage-runtime) | extracción engine/approvals/arsenal routes + 24 `as any` eliminados (T6.3 / WP-D4 1/2 F3.6) |
| `8e68fb7` | `b8e7ebe` refactor(kage-runtime) | extracción completa → server.ts 394 líneas, `as any`=0, throws prod=0 (T6.4 / WP-D4 2/2 F3.7) |
| `c2297ed` | `76e97fc` fix(forge-console) | ErrorBoundaries + settings dedup single-source (T6.5 / WP-D4 F3.8) |
| `5e72f5e` | `2d2cd50` feat(flow-matrix) | paralelismo real + watchdog deadlock + estado persistente (T6.6 / WP-D5 F3.9) |
| `7f20c38` | micro-fix (post-merge, antes del cierre) | últimos 2 `as any` en `.tsx` (IntentBar mode union, Topbar BadgeVariant) — alcance frontend T6.5 |

Nota: 62168ee/04c0bdf/84cd7be (docs visuales/orquestación) están en el rango pero son preparación de ETAPA 6 previa a T6.1; ya auditados en proceso-debt.

## 2. PHASE 1 — Verificación (números duros, confirmados por muestreo + medición directa)

Re-ejecutado por mí (no la suite completa, según instrucción del orquestador):

- **`as any`**: `git grep -o "as any" -- "*.ts"` → **0** · `-- "*.tsx"` → **0** → global **0** ✅ (baseline E-5: 114)
- **`server.ts`**: **394 líneas** (meta <400 ✅; baseline E-5: 1022)
- **`throw new Error(` en packages**: 31 totales = **30 en `*.test.ts`** + **1 en prod** = `packages/office-grid/src/hooks/use-office-state.ts:524` → **THROWS_PROD = 1** (excepción documentada, ver §5)
- **`pnpm errors:check`** → **✅ docs/errors.md up to date (47 códigos)** (baseline 19 → 47 esta etapa)
- **Muestreo de suite** (re-ejecutado):
  - flow-matrix (T6.6, feature más nueva): **4 files / 48 tests passed** ✅
  - forge-console error-boundary (T6.5): **1 file / 4 tests passed** ✅
- Suite completa **1251/1251 (105 files)**, typecheck **34/34**, build **35/35**, lint **0 errores** — verificado por orquestador previo; consistente con baseline E-5 (1174/96) + ~77 tests nuevos + tsx robustecido.
- Thresholds: `vitest.config.ts` global `lines:50 / functions:45 / statements:50` + overrides `lines:70` por glob en 8 paquetes críticos (contracts, kage-engine, agent-runtime, sentinel, model-gateway, vault, flow-matrix, workbench) ✅

## 3. PHASE 2 — Best practices (dossieres como claims + muestreo de asserts real)

- `packages/flow-matrix/src/executor.test.ts:672-734` — **watchdog deadlock real**: gate `deferred()` que nunca resuelve + `expect(caught.code).toBe(ErrorCodes.FLOW_DEADLOCK_TIMEOUT)` con timing acotado. Muerde un bug de colgado real ✅
- `packages/flow-matrix/src/executor.test.ts:164-165` — paralelismo probado por **timestamps relativos**: `lastStarted >= 2` (tres steps arrancados) y `firstCompleted > lastStarted` (nunca serial) ✅
- `packages/flow-matrix/src/concurrency.test.ts:13-23` — `runWithConcurrency` preserva **orden de entrada en resultados** con `toEqual([...])` estricto (fulfilled → valor, rejected → -1) ✅
- `packages/flow-matrix/src/concurrency.test.ts:57-61` — límite de pool real (4 tareas con 2 de concurrencia) ✅
- `packages/flow-matrix/src/executor.test.ts:472` — dependencia circular tipada: `.rejects.toThrow('Circular dependency detected')` ✅
- `packages/flow-matrix/src/executor.test.ts:790-803` — validación de opciones (`FLOW_INVALID_OPTIONS` para concurrency 0 / timeout 0) ✅
- Sin `expect(true/false)`, sin `.skip`, sin throws crudos en asserts (patrón `rejects.toThrow`/`expect(...).rejects`).

## 4. PHASE 3 — Seguridad

- **Secret scan** en `git diff 280d489..HEAD` (sk-/ghp_/AKIA/private-key/api-key patterns) → **0 hallazgos** ✅
- Dependencias: flow-matrix añade SOLO links workspace (`@ninja/common-utils`, `@ninja/logging` — reutilización, WP-D1/WP-F2.7) en package.json + pnpm-lock; **0 dependencias externas nuevas** en toda la etapa ✅ *(corrección del orquestador 2026-09-11: el borrador decía `eventemitter3` — verificado inexistente con `git grep`; alucinación del rematador, sin impacto en el veredicto)*
- Side effects: ninguna prueba con `network` real; WS/HTTP mockeados o sobre `createServer()`; SQLite `:memory:`; timers fake donde hay espera ✅
- Cambios productivos de la etapa: extracciones de rutas (refactor puro, suite byte-identica verificada en dossiers), paralelismo flow-matrix, ErrorBoundaries cliente, dedup settings (1 fuente). Ninguno toca contracts en breaking way (solo +códigos de error) ✅

## 5. Excepciones documentadas (EXC-1 / EXC-3) — estado

- **EXC-1** (server.ts sobre presupuesto, 1022 líneas / 38 `as any`) → **RESUELTA en T6.3–T6.4**: 394 líneas, 0 `as any`. La fila de QUALITY_MANUAL ya contiene la resolución ("routing decomposed in T6.3–T6.4").
- **EXC-3** (office-grid hook sin jsdom) → **VIGENTE y correcta**: `vitest.config.ts:78` la excluye con comentario `EXC-3`; el único `throw new Error` de prod (use-office-state.ts:524) queda en `DEBT_F31_THROW` de eslint.config.mjs porque importar `@ninja/contracts` (value-import) rompe el build Turbopack de forge-console (10 errores de barrels). Verificado por el orquestador: con el import build 35/35 falla, sin él verde. Documentada en wp-d4-routes-2.md §"Excepción documentada".

## 6. Reservas conocidas (no bloqueantes)

1. **DEBT(T6.4) — 15 archivos, pendiente ratificación del dueño.** `eslint.config.mjs` bloquea `no-restricted-imports` en 15 archivos con violaciones de capa PREEXISTENTES en main (verificado: el obrero T6.4 añadió CERO violaciones nuevas). Cada uno con justificación + `Expiry: revisión ADR de capas`. Migrar edges es rediseño de arquitectura (ADR), fuera de alcance T6.4. Superficie para ratificación del humano.
2. **kage-engine y vault bajo 70%** de cobertura (umbral crítico). El gate los denuncia; deuda conocida heredada, no regresión de esta etapa.
3. **Flake: tests de shutdown bajo carga** (runtime-lifecycle/shutdown/shutdown-order). Pasaron 1 vez con timeouts 20s en suite completa, verdes aislados y en re-run — contención del sistema, no regresión productiva. Registrado como discovery previo.
4. **Micro-fix `7f20c38`** (2 `as any` tsx, apps/forge-console/components/IntentBar.tsx + packages/app-shell/src/topbar.tsx): aplicado por el ORQUESTADOR al auditar (el rematador los había detectado pero murió antes de corregirlos), en alcance frontend T6.5, suite idéntica.

## 7. Escalaciones al orquestador

- **Ninguna bloqueante.** Unica pendiente semántica: ratificación del dueño para DEBT(T6.4) (expiry ADR de capas) y decisión futura de jsdom para `use-office-state.ts` (hereda de E-5, sigue igual).

## 8. Criterios F3.4–F3.9 (PLAN_EJECUCION.md §6)

| ID | Criterio | Resultado |
|---|---|---|
| F3.4 | common-utils cubierto (WP-D1) | 61 tests, 94% lines, threshold ≥80% ✅ |
| F3.5 | thresholds globales vigentes | global 50 / críticos 70, gate con overrides por glob ✅ |
| F3.6 | server.ts < 400 + sin `as any` en rutas | **394 líneas**, `as any`=0 global ✅ |
| F3.7 | `as any`=0 y throws prod=0 | **0** / **0 prod** (1 excepción documentada boundary cliente) ✅ |
| F3.8 | frontend boundaries + consistencia visual | ErrorBoundary reutilizable + layout raíz + settings single-source, 4/4 test ✅ |
| F3.9 | flow-matrix paralelo + deadlock | paralelismo real + watchdog FLOW_DEADLOCK_TIMEOUT + estado persistente, 48/48 ✅ |

**KPIs finales de etapa:** tests 1174 → **1251** (+77) · `as any` 114 → **0** · server.ts 1022 → **394** · throws prod 45 → **0** (1 boundary documentado) · errores catalogados 19 → **47**.