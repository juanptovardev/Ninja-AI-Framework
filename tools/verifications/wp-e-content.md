# WP-E — Content Pack loader + Widgets con datos vivos

**WP:** E1/E4 · **Rama:** `feat/wp-e-content-metrics` · **Fecha:** 2026-09-11
**Commit:** `feat(arsenal,forge-console): content-pack loader + live widget data (WP-E1/E4)`
**Ámbito:** `packages/arsenal-registry/**` · `packages/ui-kit/src/components/widgets/**` · `apps/forge-console/**` (solo suscripción/rail) · `tools/verifications/wp-e-content.md`

---

## 1. Qué se hizo

### PARTE 1 — ContentPackLoader (WP-E1)
Nuevo módulo `packages/arsenal-registry/src/content-pack-loader.ts`:

- Lee el **inventario real** del repo: `content/skills/*.md` (3), `content/workflows/*.json` (2), `content/templates/*.json` (3) → **8 ítems**.
- Los registra en el catálogo (`ArsenalRegistry`) como `SkillDefinition` con `metadata.source = 'content-pack'` (y `metadata.kind` = skill | workflow | template; `workflowId` para workflows).
- `resolveContentRoot()` sube desde `process.cwd()` buscando `content/` (resolución robusta, no depende del CWD exacto).
- `parseSkillFrontmatter()` parsea el frontmatter `name`/`description` de los `.md`.
- **Idempotente**: si el id ya está registrado → `skipped` (no duplica, no lanza).
- **Ruta faltante** → warning logueado, sin crash (`loaded: 0`).
- `bootstrap()` ahora invoca `loadContentPack(registry)` automáticamente (firma de retorno **sin cambio**: sigue devolviendo `ArsenalRegistry`, opción `{ contentRoot }` opcional).
- `GET /api/arsenal` los expone vía `listSkills()` (no requería tocar `arsenal.routes.ts`).

### PARTE 2 — Widgets con datos vivos (WP-E4)
Nuevo módulo `packages/ui-kit/src/components/widgets/live-data.ts` con **lógica pura evento→dato** (testeable sin DOM):

- `tokenMeterFromMetrics(metrics, fallback)` — TokenMeter desde `pulse.tokenMetrics` (fallback explícito, nunca inventa datos).
- `tokenDeltaFromEvent(event)` — delta de `agent.llm.called` (0 si no aplica).
- `sessionStartFromUptime(now, uptimeSeconds)` — inicio real de sesión desde `process.uptime()` del runtime.
- `contextDepthFromTokenMeter(data)` — saturación de contexto.
- `agentStateFromTaskStatus(status)` + `agentInfoFromTask(task)` + `agentsFromTasks(tasks, limit)` — AgentStatus desde `recentTasks`.

`apps/forge-console/app/ClientLayout.tsx` (suscripción/rail):
- **ELIMINADO** `DEFAULT_TOKEN_DATA = { current: 18500, max: 32000 }` y `useState(Date.now())` para `sessionStart`.
- TokenMeter/ContextDepth ahora parten de `0` y se alimentan de `pulse.tokenMetrics` reales (dashboard) + deltas vivos de `agent.llm.called` (WS) — sin datos simulados.
- `sessionStart` se deriva del `uptime` real del runtime (`sessionStartFromUptime`).
- `agents` usan `agentsFromTasks` (lógica centralizada en ui-kit, mismo comportamiento que el mapeo inline previo).
- `contextLayers` usan `contextDepthFromTokenMeter`.

## 2. Reutilización (TRACE_FUNCIONES)
- `@ninja/common-utils`: `safeJsonParse` (parseo de JSON de content/).
- `@ninja/logging`: `createLogger`.
- `@ninja/contracts`: tipos `SkillDefinition` existentes (no se tocó `contracts/`).
- ui-kit `utils/format.ts`: funciones puras existentes de los widgets (sin cambios).

## 3. Dead code detectado (LISTADO, no borrado)
- `apps/forge-console/lib/context/GlobalStateContext.tsx` — provider **huérfano** (nadie lo importa; solo `ConnectedContextPanel.tsx` lo usa y ese tampoco se importa). Contiene `DEFAULT_TOKEN_DATA` (18500/32000) y `DEFAULT_MEMORY_LAYERS` (12400/32000) y consume `api-mock`.
- `apps/forge-console/components/ConnectedContextPanel.tsx` — componente huérfano (ningún import).
- `apps/forge-console/lib/api-mock.ts` — data mock consumida solo por el provider huérfano.
- `apps/forge-console/components/ContextPanel.tsx` — componente suelto con `useState(12400)` / `|| 32000` (sin imports detectables; ya excluido del lint en `eslint.config.mjs`).
- `packages/app-shell/src/contextpanel.tsx` — conserva `DEFAULT_TOKEN_DATA`/`DEFAULT_MEMORY_LAYERS` hardcoded como **fallback del rail** (fuera de alcance de este WP; se lista para etapa visual futura, EV-14/15).

## 4. Evidencia de aceptación

### A. `pnpm vitest run packages/arsenal-registry` → verde (31/31)
Los thresholds de coverage del `vitest.config.ts` son **globales** (span de todos los packages, T6.2). Un run de coverage de un solo package siempre reporta el resto de packages al 0% y por tanto **falla thresholds globales por diseño** (no relacionado con este WP). Con scope acotado al package afectado, el umbral global (50% lines) se cumple:

```
Test Files  3 passed (3)
     Tests  31 passed (31)

All files          | 54.04 % Stmts | 52.08 % Branch | 52.63 % Funcs | 54.09 % Lines
```
`packages/arsenal-registry/src/content-pack-loader.ts` → **83.07 % Lines**.

Tests nuevos (`src/__tests__/content-pack-loader.test.ts`, 7):
- resuelve `content/` real desde cwd · parsea frontmatter · carga 8 ítems reales con `source: content-pack` · expone en catálogo · **idempotente** (segunda carga = 0 nuevos, 8 skipped) · **ruta faltante → warning sin crash** · directorio parcial faltante → warning + carga el resto.

### B. Typechecks → 0 errores
```
> @ninja/arsenal-registry typecheck  → tsc --noEmit (0 errors)
> @ninja/ui-kit        typecheck  → tsc --noEmit (0 errors)
```

### C. `pnpm build` → 35/35
```
Tasks:    35 successful, 35 total
```

### D. Grep datos mock/hardcoded en los 4 widgets + rail (ANTES/DESPUÉS)

**ANTES (HEAD):**
```
HEAD:apps/forge-console/app/ClientLayout.tsx:28:const DEFAULT_TOKEN_DATA = {
HEAD:apps/forge-console/app/ClientLayout.tsx:29:  current: 18500,
HEAD:apps/forge-console/app/ClientLayout.tsx:30:  max: 32000,
HEAD:apps/forge-console/app/ClientLayout.tsx:46:  const [sessionStart] = useState(Date.now());
HEAD:apps/forge-console/app/ClientLayout.tsx:50:  const [tokenCurrent, setTokenCurrent] = useState(DEFAULT_TOKEN_DATA.current);
HEAD:apps/forge-console/app/ClientLayout.tsx:51:  const [tokenMax, setTokenMax] = useState(DEFAULT_TOKEN_DATA.max);
```

**DESPUÉS (trabajo):** los únicos matches restantes son `Date.now()` dentro de `sessionStartFromUptime(...)` (derivación **real** desde uptime del runtime) y el cálculo de elapsed del SessionTimer (vivo, no mock). Cero constantes inventadas (18500/32000/12400).

### E. Suite completa (regresión global)
```
Test Files  107 passed (107)
     Tests  1270 passed (1270)
```
Cobertura global: solo fallan thresholds pre-existentes de `kage-engine` (63.42% vs 70%) y `vault` (36.74% vs 70%) — **no tocados por este WP** (deuda registrada en ADR-0013 / T6.2).

### F. Lint + errors
- `eslint` sobre archivos nuevos → 0 errores (2 warnings pre-existentes no relacionados).
- `pnpm errors:check` → ✅ up to date (47 error codes).

## 5. Verificación re-ejecutable
```bash
pnpm vitest run packages/arsenal-registry            # 31/31
pnpm vitest run packages/ui-kit                      # 44/44 (incl. 12 de live-data)
pnpm --filter @ninja/arsenal-registry typecheck      # 0 errors
pnpm --filter @ninja/ui-kit typecheck                # 0 errors
pnpm build                                           # 35/35
pnpm test                                            # 1270/1270
```

## 6. Verdict del obrero
Tarea completada dentro de alcance. `FUERA-DE-ALCANCE = NINGUNA`.
