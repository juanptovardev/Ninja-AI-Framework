# WP-D4 2/2 — routes-2 + `as any` = 0 + throws prod = 0 (T6.4)

**Fecha:** 2026-09-10 · **Rama:** `feat/wp-d4-routes-2` · **Alcance:** `apps/kage-runtime/src/**`,
`packages/contracts/src/errors.ts`, `docs/errors.md` (generado), `eslint.config.mjs`
(contabilidad DEBT), archivos con `as any`/throws eliminados + este dossier.

## Parte 1 — extracción de rutas (879 → 394 líneas)

12 módulos nuevos en `apps/kage-runtime/src/routes/` (patrón `register<Domain>Routes`):

| Módulo | Dominio |
|--------|---------|
| dashboard.routes.ts | dashboard |
| forge-lab.routes.ts | forgelab |
| installer.routes.ts | install/doctor |
| integrations.routes.ts | shell/git/fs |
| learning.routes.ts | learning-loop |
| model-gateway.routes.ts | model-gateway |
| pulse.routes.ts | pulse |
| roster.routes.ts | roster |
| session.routes.ts | sessions |
| status.routes.ts | status/health extras |
| vault.routes.ts | vault/context |
| ws-events.routes.ts | WS events |

`server.ts`: **879 → 394 líneas** (meta <400 ✅). Solo composición/wiring.

## Parte 2 — `as any` = 0 global, throws prod = 0

- `git grep "as any" -- "*.ts"` → **0 resultados** (baseline ~114; T6.3 ya había eliminado 24).
  Técnica: Fastify generics, `ID=string` de contracts, `EventBusLike` (nuevo tipo estructural
  en `@ninja/events` para inyección/mocks), interfaces locales (`JsonRpcRequest`).
- `throw new Error(` en prod → **0**, migrados a NinjaError con códigos nuevos en
  `packages/contracts/src/errors.ts` (+~25 códigos: LLM/ARSENAL/FLOW/INSTALLER/FS/GIT/LIGHTRAG).
  `docs/errors.md` regenerado (45 códigos), `pnpm errors:check` verde.
- `eslint.config.mjs`: 5 archivos movidos de `DEBT_F31_THROW` a `NINJA_ERROR_MIGRATED`.

## Excepción documentada (1 throw restante, a propósito)

`packages/office-grid/src/hooks/use-office-state.ts` conserva **1** `throw new Error`:
importar `@ninja/contracts` (value-import) en ese hook cliente rompe el build Turbopack de
forge-console (10 errores: barrels `.js` de contracts irresolubles en bundling cliente).
Verificado: con el import el build falla; sin él, 35/35 verde. El hook queda en
`DEBT_F31_THROW` con comentario. NO es deuda oculta — es boundary cliente documentado.

## Evidencia (re-ejecutada por orquestador en el worktree)

- `pnpm build` → **35/35** ✅ (tras revert del import contracts en el hook)
- `pnpm typecheck` → **34/34** ✅
- `pnpm test` → **1228/1228** (102 archivos), idéntico al baseline d654185 ✅
- `pnpm errors:check` → verde (45 códigos) ✅
- E2E: bloqueado (worktree sin `.env`, igual que T6.3); rutas cubiertas por tests que bootean `createServer()`
- Flake conocido: `runtime-shutdown-order` falló 1 vez bajo suite paralela completa, verde aislado
  (contención roster-detection, ya registrado en memoria)

## Nota de proceso

Obrero kiosapi (big-pickle) hizo ~95% del trabajo en 3 sesiones (los timeouts de herramienta
mataron el proceso 2 veces; el trabajo parcial sobrevivió en el worktree). El orquestador cerró:
detectó y revirtió la regresión del build (import contracts en hook cliente), eliminó 1 código
de error huérfano, re-ejecutó todos los gates y commiteó. Sin este cierre, T6.4 habría mergeado
main roto en `pnpm build`.

## Cierre G1: 30 errores preexistentes, 1 introducido (2026-09-10)

G1 bloqueó el commit: 30 errores eslint en archivos del alcance. Mapeo riguroso del
orquestador (cada error ↔ línea en `git diff main -U0` + lint de versiones main):

- **1 introducido por el obrero**: `import type { ClientConfig, ClientId }` en
  `auto-installer.test.ts:4` (capa L3→L2). Corregido derivando tipos del SUT
  (`NonNullable<ReturnType<typeof detectClient>>`, precedente FakeEngramClient). 7/7 verde.
- **28 preexistentes en main** (probado linteando versiones main): 19 violaciones de capa
  (`no-restricted-imports`), 4 non-null assertions, 1 prefer-const, 1 no-this-alias,
  3 useless-escapes (+1 falso positivo en regex literal).
- Fixes seguros aplicados: prefer-const, no-this-alias (arrow), 4 non-null con guards,
  1 escape, imports sin uso dejados por el obrero, disable inline justificado en regex.
- **DEBT(T6.4) en eslint.config.mjs**: las 19 violaciones de capa van a bloque con
  justificación + expiración (revisión ADR capas), precedente DEBT(F3.5). Migrar los edges
  es rediseño de arquitectura, fuera de alcance. Superficie para ratificación del dueño.
