# Dogfooding Log — Ninja AI Framework v1.0 EPIC A+B
Date: 2026-06-24

## Objective

Ninja AI Framework used to validate its own plan: a senior-engineer S5 sub-agent executed
S5.1–S5.5 directly in the repository, treating the framework's own test suite, docs, and
security gates as the product under review.

## What Was Tested

### EPIC B (WP-B1 through WP-B8)
- **WP-B1**: FS boundary (`assertWithinBoundary` in `reader.ts` + `writer.ts`) — verified via 4 tests in `reader.test.ts`
- **WP-B2**: Env validation — `EnvSchema` Zod fail-fast, `sk-placeholder` removed, `LLM_BASE_URL` masked
- **WP-B3**: `NinjaError` hierarchy — typed error classes propagated through packages
- **WP-B4**: Budget pre-call check — `isOverBudget()` gating LLM calls in Model Gateway
- **WP-B5**: Guardian deny-by-default — `policyEngine` absent → returns `false` immediately
- **WP-B6**: `isAnchor` fix — Trace Ledger frozen artifacts marked correctly
- **WP-B7**: Stability Score — Pulse Center computes and emits score
- **WP-B8**: FallbackChain — provider+model fallback on rate-limit/quota, logged to Trace Ledger

### EPIC A (S0–S4)
- **S0**: Git hygiene — branch `fix/epic-b-foundations`, no loose commits on main
- **S1**: FS boundary tests (4 present, all green), NPM audit (3 High resolved, 1 moderate remaining)
- **S2**: CLI TODOs closed — `build`, `repair`, `history` commands fully implemented in `dojo-cli/src/index.ts`
- **S3**: UX gaps addressed — 14 `alert()` → toast notifications, 2 `confirm()` → `ConfirmDialog`
- **S4**: Polish pass complete

## Test Results

| Category | Count | Status |
|----------|-------|--------|
| Unit tests (pre-S3 baseline) | 292+ | ✅ passing |
| Integration tests | all | ✅ green |
| Security audit — High/Critical | 0 | ✅ resolved |
| Security audit — Moderate | 1 (postcss, not actionable) | ⚠️ tracked |
| CLI TODOs | 3 | ✅ closed |
| UI alert() replacements | 14 | ✅ done |
| UI confirm() replacements | 2 | ✅ done |

## Issues Found During S5 Execution

1. **`docs/` and `logs/` in `.gitignore`** — all documentation files required `git add -f`.
   The `.gitignore` line `docs/` blocks normal staging. This is intentional for generated docs,
   but the security review and user docs are source-controlled artifacts. Consider moving them
   to a separate `docs-src/` directory that is not ignored, or adding explicit negation patterns
   like `!docs/security/` and `!docs/user/`.

2. **`tests/integration/runtime-lifecycle.test.ts` placeholder test** — the `shutdown closes gracefully`
   test had `expect(true).toBe(true)` with no skip reason. Converted to `it.skip` with an explicit
   explanation (requires isolated child-process setup).

3. **PowerShell semicolons** — shell commands using `;` chain operator behave differently in
   PowerShell vs bash. Commands had to be split into separate invocations for reliability.

## Open Items

- **B9–B15 not started**: `selectFastest`, ContextOps, auth middleware, shell allowlist, Zod
  input boundaries, SSRF guard, rate limiting — all scheduled for EPIC C.
- **postcss moderate vuln**: Blocked by Next.js version pin. Track for EPIC E (Frontend).
- **EPIC C** (Resiliencia), **D** (Quality), **E** (Frontend), **F** (DevOps) — pending.
