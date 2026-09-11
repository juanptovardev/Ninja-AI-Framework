# WP-E3 · T7.1 — Onboarding wizard (`/setup`)

- **Rama:** `feat/wp-e-onboarding` · **Rol:** Obrero · **Fecha:** 2026-09-11
- **Alcance tocado:** `apps/forge-console/**` + este dossier. Sin nuevos tokens/componentes → `CONSISTENCIA_VISUAL.md` sin cambios (no se registró nada nuevo: todo son componentes y utilidades ya vigentes §3–§4).

## Qué se construyó

Wizard de 4 pasos en `/setup` con estado en zustand (página sigue excluida de `ShellLayout` — `ClientLayout.tsx:194` ya excluía `/setup`):

| Paso | Acción | Endpoint real |
| --- | --- | --- |
| 1. Env check | Auto-ejecución al entrar; Badge por agente (OK/Incompleto), faltantes y avisos por ítem; retry | `GET /api/doctor` ✓ existe (`routes/installer.routes.ts:79`) → `{ total, passed, failed, reports: VerifyReport[] }` con `VerifyReport = { agentId, passed, present, missing, warnings }` (`packages/installer/src/types.ts:62`) |
| 2. Test Connection | Placeholder **deshabilitado** con nota "llega en T7.4" — fuera de alcance, no implementado | — |
| 3. Workspace | Botón "Inicializar workspace y sesión" → muestra `sessionId`; retry en error | `POST /api/session/init` ✓ existe (`routes/session.routes.ts:35`) → `{ sessionId, status: 'initialized' }` |
| 4. Tour | 4 tarjetas linkables (hoverable Card) a `/mission-control`, `/office`, `/arsenal`, `/settings` + "Finalizar configuración" | — |

Estados `idle/loading/success/error` por paso con retry; carga con la utilidad `.skeleton` de `globals.css:135` (precedente: `app/commits/page.tsx`, `app/arsenal/page.tsx`). Componentes ui-kit: `Card`, `Button`, `Badge`, `PageHeader`. Cero dependencias nuevas (zustand ^5.0.14 ya estaba). Cero CSS ad-hoc: variables `--ninja-*` vía arbitrary values, patrón canónico de páginas recientes (health/approvals/artifacts).

## Decisión sobre endpoint de workspace (documentada, como pedía la tarea)

**No existe un POST de creación de workspace en el runtime.** Opciones investigadas (grep en `apps/kage-runtime/src/routes/`):

1. `POST /api/session/init` — **elegido (el más cercano)**: bootstrap real de sesión de trabajo sobre `workspaceId: 'default-workspace'`; persiste vía `SessionRepository` y registra observación Engram.
2. `POST /api/settings/workspace` — **NO existe**: solo hay GET (`dashboard.routes.ts:102`). El helper `saveWorkspaceSettings()` de `lib/api.ts:124` apunta a un endpoint fantasma (ver deuda).
3. `@ninja/workbench` gestiona el ciclo de vida del workspace, pero no expone ruta HTTP de creación.

## Tests

`apps/forge-console/src/__tests__/onboarding-store.test.ts` — 15 tests de la lógica pura del store (estados por paso, transiciones con clamp, retry por paso, no-op en pasos sin acción, reset), patrón del repo: vitest entorno node, `vi.hoisted` + `vi.mock('../../lib/api')` (equivalente al mock de WebSocket en `ws-client.test.ts`), sin jsdom ni Testing Library.

## E2E — BLOQUEADO (documentado, no inventado)

Los fixtures de `tests/e2e/helpers/` **no permiten mockear el runtime**: `e2e-utils.ts` solo ofrece `waitForRuntime` (polling `/health` contra runtime real) y `navigateTo`; `runtime-launcher.ts` levanta el runtime completo, y `playwright.config.ts` lo auto-spawnea. Añadir un spec del wizard exigiría crear infraestructura de mocking nueva (fuera del presupuesto de la tarea: "NO inventes fixtures nuevos de más"). El paso 1 del wizard degrada con elegancia sin runtime (estado error + retry), igual que las páginas existentes. **Cobertura propuesta para un WP futuro:** spec E2E con `page.route()` interceptando `/api/doctor` y `/api/session/init` si el orquestador autoriza el helper de mocking.

## Deuda / dead code detectado (LISTADO, no borrado)

1. `apps/forge-console/lib/api.ts:124` `saveWorkspaceSettings()` → POST a `/api/settings/workspace`, endpoint **no registrado** en el runtime (fallaría 404). Lo consume `app/settings/page.tsx`.
2. `apps/forge-console/lib/api.ts:53` → `console.error` en el helper `request` (fuera del alcance de esta WP; la regla "cero console" aplica a archivos nuevos).
3. La página `/setup` anterior era estática legacy (zinc/emerald, deuda V-7/V-8) con `pnpm dev --concurrency 50` como única guía — reemplazada por el wizard (no es dead code remanente, quedó sustituida en el mismo archivo).

## Evidencia de aceptación (outputs reales)

**1. `pnpm --filter @ninja/forge-console typecheck` → 0 errores**

```
> @ninja/forge-console@1.0.0 typecheck C:\...\apps\forge-console
> tsc --noEmit
```

**2. Tests del wizard → 15/15 verdes**

```
 RUN  v4.1.4 C:/.../wt-e7-a
 Test Files  1 passed (1)
      Tests  15 passed (15)
   Duration  1.14s
```

Suite global sin regresiones: `Test Files 106 passed (106) · Tests 1266 passed (1266)`.

**3. `pnpm build` → 35/35**

```
 Tasks:    35 successful, 35 total
Cached:    33 cached, 35 total
  Time:    1m4.936s
```

(El build incluye `/setup` prerenderizado como estática — listado en la salida de Next.)

**4. Cero `as any`, cero `console.*` en archivos nuevos**

```
Select-String -CaseSensitive -Pattern "as any|console\." sobre
  lib/onboarding-store.ts · app/setup/page.tsx · src/__tests__/onboarding-store.test.ts
→ sin coincidencias
```

Extras: `pnpm lint` → 0 errores (60 warnings preexistentes, ninguno en archivos de esta WP) · `pnpm errors:check` → ✅ up to date (47 códigos).

## Orden de ejecución notado

`packages/ui-kit/dist` no existía en el worktree → TS2307 potencial en typecheck; se resolvió con `pnpm build` primero (orden de build, no bug — no se tocó `tsconfig.json`).

## REPORTA

REPORTA SHA=<pendiente> | STEPS=4 | TESTS=15/15 | BUILD=35/35 | E2E=bloqueado+fixtures de tests/e2e/helpers solo soportan runtime real (waitForRuntime), sin infra de mocking y no se inventaron fixtures nuevos | DOSSIER=wp-e-onboarding.md | FUERA-DE-ALCANCE=NINGUNA
