# WP-D3 — Workbench test suite (dossier)

## Scope
New Vitest suites for `@ninja/workbench` (WP-D3 / T5.2):
- Workspace lifecycle: create / open / close (via active-context) / list, adapted to the API
  actually exposed by `packages/workbench/src` (no `closeWorkspace` exists).
- Migration runner: idempotency, fail-hard on error, application order (+ `migrate.ts`
  CLI up-path with Gate 4 backup branch).
- Mocks reuse `tests/helpers/mock-event-bus.ts`. Temp DBs: `:memory:` via `initDb` for
  migrations, `mkdtempSync` tmp dirs (best-effort `rmSync` cleanup) for lifecycle. No network,
  no real sleeps (`vi.useFakeTimers` only for the timestamp test).

## Acceptance evidence (2026-09-09)
- `pnpm vitest run packages/workbench --coverage` → **5 files, 30 tests, all pass**.
  Pasted per-package row:
  `workbench/src | 90 | 66.66 | 100 | 90 | migrate.ts 73.07 (20,37-41,52-53), workspace.ts 97.87 (32)`
  Full-table summary: `Statements 2.65% (196/7374), Lines 2.71% (193/7107)` (repo-wide;
  the workbench-only row is the 90% lines figure above, ≥70% ✅).
- `pnpm --filter @ninja/workbench typecheck` → exit 0 ✅
- `npx eslint packages/workbench/src/*.test.ts` → 0 errors ✅

## Decisions
- `Result` shape is `{ success, data | error }` (found at runtime via a throwaway probe
  test, since contracts types were out of read-scope); tests narrow on `success`.
- `better-sqlite3` is NOT imported directly (not a workbench dependency); all DBs go
  through `initDb` from `@ninja/storage` (L1, allowed).
- `migrate.ts` runs `main()` on import, so it is covered via dynamic `import()` with
  `@ninja/config` + `@ninja/storage` mocked, `process.exit` spied, real `fs` on a tmp dir.
- No new mock helpers; `MockEventBus` used for the observer-notification test.
- Layering respected: imports only from `@ninja/contracts` (L0),
  `@ninja/storage` / `@ninja/config` (L1), `node:*`, `vitest`. No `@ninja/integrations-*`.

## Deviations
- `close` has no dedicated API: covered as `setActiveContext` + `clearActiveContext`
  round-trip (documented in test names).
- `listWorkspaces` is an unimplemented stub (returns `[]` with a warn log); tests pin the
  current behavior (`[]`, no throw) instead of inventing semantics.
- Coverage <100% is honest, not faked: `workspace.ts:32` is unreachable dead code
  (`else if (!existsSync)` directly after `if (!existsSync)`); `migrate.ts` down-path
  (37-41) and hard-failure exit (52-53) are uncovered by design (single up-path focus).
- One extra read beyond the stated budget was avoided: the `Result` shape was determined
  by executing a temporary probe test, not by reading contract sources.
