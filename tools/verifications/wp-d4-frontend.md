# WP-D4 · Verification Dossier — Frontend hardening (PARCIAL, Parte 1/2)
**Branch**: `feat/wp-d4-frontend` (worktree aislado, cambios UNCOMMITTED)
**Fecha**: 2026-09-10
**Tarea**: T6.5a REDUCIDA — SOLO Error Boundaries (settings va en la Parte 2/2, NO tocado).
**Alcance**: `apps/forge-console` (ErrorBoundary + fallback + test + layout raíz) + 2 fixes de
config INFRA requeridos para cumplir la aceptación + dossier. **Cero** dependencias nuevas,
**cero** `as any`, **cero** throws crudos nuevos.

> **ESTADO: PARCIAL — Parte 1/2.** Falta (próxima tarea): settings/reintento de contextos,
> cierre del dossier con evidencia re-ejecutable completa y veredicto.

---

## Entregado

### 1. `apps/forge-console/components/ErrorBoundary.tsx` (NUEVO)
- `ErrorBoundary` — class component nativo (`React.Component`, client component `'use client'`),
  sin dependencias nuevas.
- `ErrorFallback` — fallback UI construido SOLO con ui-kit existente (`Card`, `Badge`, `Button`)
  + utilidades core Tailwind (`min-h-screen`, `max-w-md`, `font-mono-data` de `globals.css`).
  Compone con `CONSISTENCIA_VISUAL.md` §4/§6-§7: ningún HEX literal nuevo, sin `style={{color}}`,
  sin paletas ajenas; `Badge danger` (semántica error §2.1), `Button primary` como CTA.
- Protocolo React completo: `getDerivedStateFromError` → `hasError`; `componentDidCatch` →
  `console.error('[ErrorBoundary] …', error, info.componentStack)`; `handleReset` → vuelve a
  renderizar children.
- Botones/fallback con texto legible: "Reintentar" (reset), "Error capturado", mensaje real del
  error en `font-mono-data`.

### 2. `apps/forge-console/src/__tests__/error-boundary.test.ts` (NUEVO, 4 tests)
Ejercitan la ruta completa del protocolo de boundary en entorno `node` (vitest). El entorno del
repo no tiene jsdom y el slot prohibe dependencias nuevas; los error boundaries de React NO
operan bajo `renderToString` (server). Por eso se testea el protocolo de forma determinista:
1. `getDerivedStateFromError(error)` → `{ hasError: true, error }` (la transición que React ejecuta
   cuando un hijo lanza).
2. `componentDidCatch` → `console.error` invocado con prefijo + error + componentStack (spy).
3. `renderToString(<ErrorFallback/>)` → fallback se renderiza (título + mensaje del error + botón
   "Reintentar").
4. Sin error → boundary renderiza children intactos (sin "Error capturado").

> Nota técnica: el archivo es `.test.ts` (no `.tsx`) porque el `include` de vitest solo matchea
> `*.test.ts`; por eso usa `React.createElement` en lugar de JSX.
> La prueba DOM full "hijo real que lanza → fallback en pantalla" queda cubierta por E2E
> (Playwright), precedente EXC-3 del repo (sonrisa jsdom).

### 3. `apps/forge-console/app/layout.tsx` (MODIFICADO — envoltura del layout raíz)
`<ErrorBoundary>` envuelve `<ClientLayout>{children}</ClientLayout>` + `<CommandPalette />`
dentro del `<body>`. Cubre así las 3-5 vistas principales (mission-control, office, plan,
health, artifacts, approvals, discovery, settings en Parte 2) dado que todas comparten este
layout raíz.

### 4. Fixes de config INFRA (REQUERIDOS para cumplir aceptación — documentados, fueron
###    fallas pre-existentes del branch)
- **`apps/forge-console/tsconfig.json`**: `baseUrl` "." → `"../.."` + override `paths` para los
  4 paquetes `@ninja/*` que consume la app. **Causa raíz:** el tsconfig base define `paths`
  (`@ninja/*` → `packages/*/src`) relativos al repo, pero forge-console sobrescribía
  `baseUrl: "."` → todos los imports `@ninja/*` resolvían a `apps/forge-console/packages/...`
  (inexistente). Sin este fix, `typecheck` fallaba en 17 archivos ANTES de tocar nada
  (verificado: baseline del branch reproducido con los cambios stasheados).
- office-grid se consume de su **build** (`dist/index.d.ts`, tsup ya existente) porque su
  `@hello-pangea/dnd` (fork de react-beautiful-dnd) no es compatible con `CSSProperties` de
  `@types/react@19` (`--radix-${string}`) al compilarlo en el contexto de forge-console.
  office-grid typecheckea OK standalone; el mismatch solo aparece bajo el contexto de la app.
  Consumir `.d.ts` del build es el contrato declarado en `package.json` `exports.types` → dist.
- **`vitest.config.ts`**: +`oxc: { jsx: { runtime: 'automatic' } }`. Vitest (vite 8) parsea los
  `.tsx` con oxc y, al heredar `jsx: 'preserve'` del tsconfig de forge-console, fallaba el
  import-analysis del componente. Sin esto el test del nuevo `.tsx` no puede importarse.
  **Sin riesgo de regresión:** la suite completa quedó verde (ver evidencia).

---

## Evidencia (re-ejecutable)

### Aceptación 1 — `pnpm --filter @ninja/forge-console typecheck`
```text
> @ninja/forge-console@1.0.0 typecheck
> tsc --noEmit
→ exit 0, 0 errores ✅
```

### Aceptación 2 — tests nuevos
```text
pnpm vitest run apps/forge-console/src/__tests__/error-boundary.test.ts
 Test Files  1 passed (1)
      Tests  4 passed (4) ✅
```

### No regresión (cambio de config repo-wide)
```text
pnpm vitest run
 Test Files  103 passed (103)
      Tests  1232 passed (1232) ✅
```
(Baseline branch 96 files/1174 tests → run actual 103/1232: +7 archivos/+58 tests ya presentes
en el branch ajenos a este WP; todos verdes.)

### Aceptación 3 — sin `as any` / sin throws crudos
```text
npx eslint apps/forge-console/components/ErrorBoundary.tsx apps/forge-console/src/__tests__/error-boundary.test.ts
→ 0 errores, 0 warnings ✅
```
Sin `as any` (grep), sin `throw` en código de producción nuevo (el único throw es el error
controlado que la UI del ErrorBoundary captura).

---

## Desviaciones / deviations
- **tsconfig.json / vitest.config.ts modificados** (infra, NO en la lista de archivos del prompt).
  Justificación: la aceptación 1 exige `typecheck` en 0 errores y el typecheck del branch estaba
  roto de base (17 errores pre-existentes reproducidos con cambios stasheados); el test del
  componente `.tsx` no podía importarse sin el runtime jsx en vitest. Ambos fixes son 1-3 líneas,
  no tocan settings, kage-runtime, ni packages ajenos, y la suite completa sigue verde.
- Fallback en idioma del producto (ya en uso en el repo): "Reintentar", "Algo salió mal".

## FUERA DE ALCANCE (no tocado)
Settings, kage-runtime, packages/*, dependencias nuevas, `app/error.tsx` (global de servidor —
candidato a discutir en Parte 2).

## Files created / modified
- CREATED `apps/forge-console/components/ErrorBoundary.tsx`
- CREATED `apps/forge-console/src/__tests__/error-boundary.test.ts`
- MODIFIED `apps/forge-console/app/layout.tsx` (envoltura con ErrorBoundary)
- MODIFIED `apps/forge-console/tsconfig.json` (baseUrl + paths @ninja → repo; office-grid → dist)
- MODIFIED `vitest.config.ts` (oxc jsx runtime automatic para importar .tsx)
- CREATED `tools/verifications/wp-d4-frontend.md` (este dossier, PARCIAL Parte 1/2)
- BUILD ARTIFACT (gitignored): `packages/office-grid/dist/` (tsup, contrato exports.types)

---

# PARTE 2/2 — Settings dedup (T6.5b)
**Fecha**: 2026-09-10 | **Alcance**: `apps/forge-console/**` + este dossier. **Cero** deps nuevas,
**cero** `as any`, **cero** throws, **cero** toques a kage-runtime / packages / tsconfig / vitest.

## Problema (EV-23)
Dos implementaciones de settings duplicadas (~80%) en `apps/forge-console`:
1. `app/settings/page.tsx` — página ruta `/settings` (superficie Forge Console canónica: tokens
   `--ninja-*`, `PageHeader`, GSAP).
2. `components/SettingsOverlay.tsx` — modal (superficie UCC legada: colores zinc/emerald
   hardcodeados, emojis).

Bloques 100% duplicados: `providerTypeOptions`, `providerDefaults`, fetch + CRUD de providers y
workspace, `ConfirmDialog`. Los tipos (`LLMProvider`, `WorkspaceSettings`, `ProviderType`) y los
fetch helpers (`fetchProviders`/`fetchWorkspaceSettings`) ya eran compartidos en `lib/`.

## Decisión — fuente única = `app/settings/page.tsx`
Consumidores de la ruta `/settings`: sidebar `@ninja/app-shell` (`packages/app-shell/src/sidebar.tsx:88`)
+ `CommandPalette` (`router.push('/settings')`) → es la superficie canónica del producto y la
estética alineada a `CONSISTENCIA_VISUAL`. El modal tenía 1 consumidor (dashboard UCC legado) y
usaba paleta ajena al token system; queda eliminado.

## Boundary frontend/backend (documentado, NO migrado)
Fetch/CRUD de providers y workspace viven en backend `/api/settings/*`. **No** se migran a un store
local: el boundary queda en `lib/api.ts`, único archivo que conoce los endpoint strings, con helpers
tipados `fetchProviders`, `fetchWorkspaceSettings` + nuevos `saveProvider`, `deleteProvider`,
`saveWorkspaceSettings`.

## Migración (archivo por archivo)
- **`lib/settings.ts` (NUEVO)** — fuente única de `providerTypeOptions`, `providerDefaults` y
  `buildProviderFormDefaults` (lógica del preset del form que estaba duplicada). Puro, importable
  sin DOM → testable en entorno `node`.
- **`app/settings/page.tsx` (MOD)** — elimina las 2 constantes duplicadas, usa
  `buildProviderFormDefaults`; reemplaza los 3 `api.post/del('/api/settings/...')` crudos por los
  helpers tipados; limpia 5 imports de `@ninja/ui-kit` sin uso pre-existentes (Card, Input, Select,
  Divider, Spinner).
- **`lib/api.ts` (MOD)** — +3 helpers tipados de CRUD settings.
- **`components/UccDashboard.tsx` (MOD)** — migra los 2 entry points de settings (botón header +
  atajo `⌘,`) de `toggleSettings()` (modal) → `router.push('/settings')`; elimina import/render de
  `SettingsOverlay` e import sin uso de `api`.
- **`components/SettingsOverlay.tsx` (BORRADO)** — duplicado; verificado sin consumidores restantes.
- **`src/__tests__/settings-dedup.test.ts` (NUEVO, 5 tests)** — comportamiento del preset unificado +
  2 guards estructurales de "fuente única".

## Dead code (LISTADO — NO borrado, regla del slot)
- `lib/ucc-store.ts`: `isSettingsOpen` + `toggleSettings` quedan sin consumidores tras borrar el modal.
  (Los flags de overlays de Office siguen vivos; solo estos 2 de settings son dead.)
- `lib/api-mock.ts` bloque settings: `mockProviders`, `mockWorkspaceSettings`, `getProviders`,
  `getWorkspaceSettings`, `saveProvider`, `saveWorkspaceSettings`, `testProviderConnection`,
  `deleteProvider` — sin consumidores (solo `getSystemStatus` se usa desde
  `lib/context/GlobalStateContext.tsx`). Nota: el bloque contenía un `as LLMProvider` (dead, íntegro).

## GREP de fuentes de settings — ANTES / DESPUÉS
BEFORE — callers de `/api/settings`:
```text
apps/forge-console/lib/api.ts:100,105
apps/forge-console/components/SettingsOverlay.tsx:135,173,186
apps/forge-console/app/settings/page.tsx:162,200,213
```
AFTER — mismo grep (producción, excluye `__tests__`):
```text
apps/forge-console/lib/api.ts:100,105,117,121,125
```
→ Solo el boundary backend (`lib/api.ts`) conoce los endpoints; **cero** UIs con string de API crudo.
`providerTypeOptions`/`providerDefaults` viven en **1** archivo (`lib/settings.ts`), consumido por la
página; antes estaban duplicados en 2.

## Evidencia (re-ejecutable)
### Aceptación 1 — typecheck
```text
pnpm --filter @ninja/forge-console typecheck
> tsc --noEmit
→ exit 0, 0 errores ✅
```
(Dist de office-grid del Parte 1 presente; sin TS2307, sin tocar tsconfig.)

### Aceptación 2 — tests del área settings
```text
pnpm vitest run apps/forge-console/src/__tests__/settings-dedup.test.ts
 Test Files  1 passed (1)
      Tests  5 passed (5) ✅
pnpm vitest run apps/forge-console/src/__tests__/settings-dedup.test.ts apps/forge-console/src/__tests__/error-boundary.test.ts apps/forge-console/src/__tests__/ws-client.test.ts
 Test Files  3 passed (3)
      Tests  21 passed (21) ✅
```
(los 4 tests de ErrorBoundary de la Parte 1 y los 12 de ws-client siguen verdes — sin regresión.)

### Aceptación 3 — lint / sin `as any`
```text
npx eslint apps/forge-console/lib/settings.ts apps/forge-console/lib/api.ts
          apps/forge-console/app/settings/page.tsx apps/forge-console/components/UccDashboard.tsx
          apps/forge-console/src/__tests__/settings-dedup.test.ts
→ 0 errores, 0 warnings ✅
```
Sin `as any` nuevo (los del archivo borrado desaparecen con él). El `as ProviderType` restante en
`page.tsx` es un narrowing de string ya existente, no un `any`.

## FUERA DE ALCANCE (no tocado)
kage-runtime, packages/* (sidebar `app-shell` ya apunta a `/settings`, sin cambio), `vitest.config.ts`,
`tsconfig.json`, deps nuevas, `app/error.tsx`, `OfficeOverlay`. Parte 1/2 (ErrorBoundary) intacta.

## Files created / modified — PARTE 2/2
- CREATED `apps/forge-console/lib/settings.ts`
- CREATED `apps/forge-console/src/__tests__/settings-dedup.test.ts`
- MODIFIED `apps/forge-console/lib/api.ts` (+3 helpers CRUD settings)
- MODIFIED `apps/forge-console/app/settings/page.tsx` (consume fuente única)
- MODIFIED `apps/forge-console/components/UccDashboard.tsx` (migra a /settings)
- DELETED `apps/forge-console/components/SettingsOverlay.tsx` (duplicado)
- MODIFIED `tools/verifications/wp-d4-frontend.md` (esta Parte 2/2)