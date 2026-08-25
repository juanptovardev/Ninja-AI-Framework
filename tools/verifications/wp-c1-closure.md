# WP-C1 Closure Dossier — Global Error Handler

**Date**: 2026-07-01
**EPIC**: C — Resiliencia & Error Handling

## Deliverables

| # | Commit scope | Status |
|---|--------------|--------|
| 1 | `error-handler.ts` with `setErrorHandler` + `setNotFoundHandler` | ✅ Done |
| 2 | Wire `registerErrorHandlers` in `server.ts` (after auth, before routes) | ✅ Done |
| 3 | 6 error-handler tests green (red→green TDD) | ✅ Done |
| 4 | Redundant try/catch removal in `server.ts` (28→14) | ✅ Done |
| 5 | Empty catch block fix (WS onmessage) | ✅ Done |
| 6 | ADR-0009 committed | ✅ Done |

## Metrics

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| `try {` in server.ts | 28 | 14 | ≤15 |
| `setErrorHandler` | 0 | 1 | 1 |
| `setNotFoundHandler` | 0 | 1 | 1 |
| Empty catch blocks (kage-runtime) | 2 | 1 (intentional fallback) | 0 silent |
| Error-handler tests | 0 (untracked, 2 failing) | 6 passing | 6 green |

## Files changed

- `apps/kage-runtime/src/error-handler.ts` — **created** (centralized error handler)
- `apps/kage-runtime/src/server.ts` — **modified** (wire handler, remove redundant try/catch)
- `docs/adr/0009-centralized-error-handling.md` — **created**

## Test count

Before: 747 pass, 2 fail, 3 skip (752 total)
After: 748 pass, 1 fail (pre-existing allowlist), 3 skip (752 total)

## Excluded from scope

- Empty catch blocks in packages/ (forge-lab, agent-runtime, etc.) — deferred to EPIC D
- `try/catch` in `lifecycle.ts`, `failover.ts`, `mcp-runtime-server.ts` — they are not route handlers; the global handler does not cover them
