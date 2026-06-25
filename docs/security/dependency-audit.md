# Dependency Security Audit

Date: 2026-06-24
Command: `pnpm audit --prod`

## Summary

Initial run (before fixes):
- High: 3
- Moderate: 2
- Low: 0

After fixes (current state):
- High: 0
- Moderate: 1
- Low: 0

## Findings

### ✅ RESOLVED — fast-uri path traversal (High) · GHSA-q3j6-qgpj-74h6
- **Package**: fast-uri ≤3.1.0
- **Path**: `fastify > @fastify/ajv-compiler@4.0.5 > ajv@8.18.0 > fast-uri@3.1.0`
- **Fix**: ≥3.1.1
- **Action**: Added `pnpm.overrides.fast-uri = "3.1.2"` in root `package.json`

### ✅ RESOLVED — fast-uri host confusion (High) · GHSA-v39h-62p7-jpjc
- **Package**: fast-uri ≤3.1.1
- **Path**: same as above
- **Fix**: ≥3.1.2
- **Action**: Covered by the same `fast-uri = "3.1.2"` override above

### ✅ RESOLVED — ws DoS from tiny fragments (High) · GHSA-96hv-2xvq-fx4p
- **Package**: ws ≥8.0.0 <8.21.0
- **Paths**: `companion-extension > ws@8.20.0`, `kage-runtime > @fastify/websocket > ws@8.20.0`
- **Fix**: ≥8.21.0
- **Action**:
  - Bumped direct dep in `apps/companion-extension/package.json`: `"ws": "8.21.0"`
  - Added `pnpm.overrides.ws = "8.21.0"` in root `package.json` for transitive paths

### ⚠️ OPEN — postcss XSS via unescaped </style> (Moderate) · GHSA-qx2v-qp2m-jg93
- **Package**: postcss <8.5.10
- **Path**: `geist@1.7.2 > next@16.2.7 > postcss@8.4.31` (12 paths, all via next)
- **Fix**: postcss ≥8.5.10
- **Status**: Cannot bump without bumping `geist` which pins `next`. Out of scope for S1. Track separately.

### ⚠️ OPEN — ws Uninitialized memory disclosure (Moderate) · GHSA-58qx-3vcg-4xpx
- **Package**: ws ≥8.0.0 <8.20.1
- **Path**: same as ws above
- **Status**: Resolved by the ws override to 8.21.0 (8.21.0 ≥ 8.20.1). This was already fixed by the High fix above.
  > Note: This moderate was already covered by the ws@8.21.0 bump; the single remaining `pnpm audit` output shows only the postcss moderate.

## Notes

- `next@^16.2.7` already installed (plan target `^15.5.18` was stale — tracking corrected).
- Added `pnpm.overrides` section in root `package.json` to pin transitive `fast-uri@3.1.2` and `ws@8.21.0`.
- Bumped `apps/companion-extension/package.json` direct dep `ws` from `^8.18.0` to `8.21.0`.
- Current state after `pnpm install`: **1 moderate** (postcss, not actionable without next bump).
