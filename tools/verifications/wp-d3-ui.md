# WP-D3 (T5.6) · Verification Dossier — UI coverage top-up + app-shell decision
**Branch**: `feat/wp-d3-ui` (worktree `ninja-t56`, changes UNCOMMITTED per instructions)
**Date**: 2026-09-09
**Scope**: `packages/ui-kit`, `packages/office-grid`, `packages/app-shell` (+ dossier). No source
modifications, no new dependencies, no DOM/jsdom/testing-library.

---

## Resumen

- `packages/office-grid/src/grid-logic.test.ts`: 40 → **63 tests** (+23, pure logic only, no DOM).
  `grid-logic.ts` reaches **100% stmts / 100% funcs / 100% lines** (v8).
- `packages/ui-kit`: untouched, still **55.80% stmts (≥50% ✅)**.
- `packages/office-grid` per-package: **33.82% stmts (31.88% → 33.82%)** — below the 50% target.
  Honest gap documented below: `hooks/use-office-state.ts` (0/137 stmts) needs React render +
  WebSocket mocks (jsdom), which the slot constraints forbid. Not gamed with fake tests.
- App-shell: **option (b) — the package STAYS** (`packages/app-shell/src/shell.test.ts`, 4/4 green).
- Gates: typecheck ui-kit ✅, typecheck office-grid ✅, eslint on test files **0 errors** ✅.

---

## Coverage (acceptance outputs, pasted)

### `pnpm vitest run packages/ui-kit packages/office-grid --coverage` (v8 text, package rows)

```text
 Test Files  2 passed (2)
      Tests  95 passed (95)

 File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
 office-grid/src   |     100 |    97.61 |     100 |     100 |
  grid-logic.ts    |     100 |    97.61 |     100 |     100 | 297
 ui-kit/src/hooks  |       0 |        0 |       0 |       0 |
  useInterval.ts   |       0 |        0 |       0 |       0 | 9-29
  useWebSocket.ts  |       0 |        0 |       0 |       0 | 15-99
 ui-kit/src/utils  |   98.52 |    97.91 |     100 |     100 |
  format.ts        |   98.52 |    97.91 |     100 |     100 | 118
```

(Note: the vitest `include` is `packages/*/src/**/*.ts`, so `.tsx` components are excluded from
coverage by config; `types.ts`/`index.ts`/`*.test.ts` are excluded too. Global "All files" stays
~2% because the run only executes the 2 UI test files — expected.)

### Per-package aggregation (`coverage-final.json`, same method as previous worker `agg-t56.cjs`)

```text
office-grid/grid-logic.ts s=67/67 f=25/25 b=41/42
office-grid/schema.ts s=3/3 f=0/0 b=0/0
office-grid/hooks/use-office-state.ts s=0/137 f=0/29 b=0/39
ui-kit/components/pro/index.ts s=0/0 f=0/0 b=0/0
ui-kit/hooks/useInterval.ts s=0/12 f=0/5 b=0/4
ui-kit/hooks/useWebSocket.ts s=0/48 f=0/10 b=0/14
ui-kit/styles/tailwind.config.ts s=2/2 f=0/0 b=0/0
ui-kit/styles/theme.ts s=8/8 f=0/0 b=0/0
ui-kit/utils/format.ts s=67/68 f=18/18 b=47/48
PKG office-grid stmts=33.82% funcs=46.30% branch=50.62%
PKG ui-kit stmts=55.80% funcs=54.55% branch=71.21%
```

| Métrica | Baseline (worker previo) | Final (este turno) |
|---|---|---|
| office-grid stmts | 31.88% | **33.82%** (grid-logic 63/67 → **67/67**) |
| office-grid grid-logic.ts branch | 36/42 | **41/42** |
| ui-kit stmts | 55.80% ✅ | **55.80%** ✅ (sin cambios) |
| Tests ui-kit + office-grid | 66 | **95** (+23 office-grid, +6 ya presentes) |

### Typecheck + lint + app-shell (acceptance outputs, pasted)

```text
pnpm --filter @ninja/ui-kit typecheck      → tsc --noEmit, exit 0 ✅
pnpm --filter @ninja/office-grid typecheck → tsc --noEmit, exit 0 ✅
npx eslint ui-kit/.../format.test.ts office-grid/.../grid-logic.test.ts app-shell/.../shell.test.ts
→ 0 errors, 1 warning (pre-existing: format.test.ts:20 'ninjaTransitions' unused — not touched) ✅
pnpm vitest run packages/app-shell → Test Files 1 passed, Tests 4 passed ✅
```

---

## App-shell decision: (b) KEEP — rationale

1. **Live consumers outside the slot scope.** `apps/forge-console/app/ClientLayout.tsx` imports
   `{ ShellLayout, ContextPanel }` and `apps/forge-console/components/ConnectedContextPanel.tsx`
   imports `{ ContextPanel }` from `@ninja/app-shell` (plus `package.json: workspace:*`,
   `tailwind.config.ts` content glob and `app/globals.css` `@source`). Option (a) would force edits
   in `apps/forge-console/**` — explicitly out of scope (only ui-kit/office-grid/app-shell + the 3
   config files).
2. **Dependency direction forbids the merge.** `packages/app-shell/package.json` depends on
   `@ninja/ui-kit: workspace:*` (`topbar.tsx` uses `Badge`, `SessionTimer`; `contextpanel.tsx` uses
   `TokenMeter`, `AgentStatus`, `SessionTimer`, `ContextDepth`, `Divider`). Dissolving app-shell
   into ui-kit would drag `@phosphor-icons/react`, `@radix-ui/react-tooltip`, `gsap`, `geist` into
   the design-system package = new dependencies for ui-kit (hard constraint violation).
3. **Cohesion.** app-shell is app composition (3-column ShellLayout + runtime nav + observability
   right-rail), not generic design-system primitives. Forcing it into ui-kit breaks the
   design-system (ui-kit) / app-composition (app-shell) separation.
4. Contract locked by `packages/app-shell/src/shell.test.ts` (existence: ShellLayout/Sidebar/
   ContextPanel/Topbar exports + SidebarProps/TopbarProps navigation contract). No config changes
   were needed (option b touches no aliases).

---

## Honest gap (no fake tests): why office-grid cannot reach 50% in this slot

- **File**: `packages/office-grid/src/hooks/use-office-state.ts` — **0/137 stmts, 0/29 funcs**.
  A React hook (`useState`/`useEffect`/`useRef`) + `WebSocket` lifecycle (connect, onmessage,
  onclose backoff, `moveAgent` optimistic-update + rollback over `fetch`). Covering it needs DOM
  rendering (jsdom + @testing-library/react) and WS/fetch mocks — all three forbidden by the slot
  constraints (no jsdom, no @testing-library, no new deps). Import-only "export shape" tests were
  deliberately NOT added (coverage gaming, asserts nothing a real bug would break).
- Everything else countable in the package is at ceiling: `grid-logic.ts` 67/67 stmts, 100% lines;
  `schema.ts` 3/3. Max reachable without the hook file ≈ 70/207 = 33.8% = exactly what we report.
- The hook's state-transition logic is covered **via its pure mirror**: `officeReducer` in
  `grid-logic.ts` (header: "mirrors the WS-event transitions of use-office-state") — 13 reducer
  tests including no-op/preservation contracts. Both ui-kit hooks (`useInterval` 0/12,
  `useWebSocket` 0/48) are in the same situation; ui-kit still clears 50% via `format.ts`+theme.
- Residual single lines: `format.ts:118` (`getProTableCellText` non-string-key fallback — runtime-
  unreachable since `keyof T | string` is always a string; needs a cast to hit) and
  `grid-logic.ts` branch on line 297 (one `??` fallback arm). Left as-is rather than forced.

## Findings for a future slot (NOT fixed — no source mods allowed)

1. `schema.ts` status enum allows 5 activities, `types.ts` `AgentActivity` has 7
   (`blocked`, `awaiting_approval` rejected at parse). The hook validates WS payloads with
   `officeEventSchema`, so blocked/approval transitions over WS are dropped silently. Locked by
   tests (`schema-vs-types divergence`) so it gets fixed deliberately.
2. `officeEventSchema` handles 4 of the 16 `OfficeEvent` variants (no `agent.task.*`,
   `sentinel.*`, `vault.*`). Same silent-drop surface. Locked by test.
3. `ACTIVITY_COLORS` has 6 entries (no `awaiting_approval`) while badge/pulse maps have 7 —
   canvas dots for approval states need an explicit fallback. Locked by test.
4. `state-indicators.tsx:7` imports `ACTIVITY_COLORS` but never uses it (dead import); `types.ts:6`
   imports `ID` from `@ninja/contracts` unused. Left untouched per constraints.

## Desviaciones / deviations

**None.** No component/source files modified (only the test file + this dossier); no new
dependencies; test files import only relative same-package modules (`./grid-logic`, `./schema`,
`./types`) — zero `@ninja/*` imports; ui-kit not churned (single pre-existing lint warning left
as-is); nothing committed — all changes uncommitted in the worktree as instructed.

---

## Files created / modified (this turn)

- MODIFIED `packages/office-grid/src/grid-logic.test.ts` (+23 tests, +2 imports:
  `ACTIVITY_COLORS`, `ROLE_AVATAR_COLORS`, `OfficeAction` type)
- CREATED `tools/verifications/wp-d3-ui.md` (this dossier)
- Verified untouched: `packages/ui-kit/src/utils/format.test.ts`,
  `packages/app-shell/src/shell.test.ts` (existing decision-b contract, 4/4 green)
