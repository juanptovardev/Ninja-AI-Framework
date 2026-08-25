# Security Review — EPIC A + EPIC B
Date: 2026-06-24

## Gates Verified

### FS Boundary (S1.2 + WP-B1)
- `reader.ts`: `assertWithinBoundary` called in `readFile`, `readDirectory` ✔
- `writer.ts`: `assertWithinBoundary` called in `writeFile`, `appendFile`, `ensureDirectory`, `deleteFile` ✔
- 4 boundary tests in `packages/integrations-fs/src/reader.test.ts` — all green ✔

### Environment Validation (WP-B2)
- `EnvSchema` Zod validation fail-fast at boot ✔
- `sk-placeholder` removed from `.env.example` ✔
- `LLM_BASE_URL` masked in logs (replaced with `***`) ✔

### Guardian deny-by-default (WP-B5)
- `guardian.ts`: when `policyEngine` is undefined, `evaluateAction` returns `false` immediately ✔
- `PolicyEngine` wired into `Guardian` constructor in `apps/kage-runtime/src/server.ts` ✔
- Log line emitted on deny: `"Guardian sin PolicyEngine — deny-by-default (WP-B5)"` ✔

### Budget pre-call (WP-B4)
- `isOverBudget()` checked in Model Gateway before any LLM call ✔
- Fallback chain logs budget exhaustion to Trace Ledger ✔

### Shell boundary (WP-B12)
- Status: **pending** — shell allowlist (cmd denylist + cwd restriction) scheduled for B12, not yet implemented.

### SSRF guard (WP-B14)
- Status: **pending** — SSRF protection for outbound HTTP calls scheduled for B14, not yet implemented.

### NPM Audit (S1.1)
- High/Critical resolved: 3 ✔
  - `fast-uri` path-traversal (GHSA-q3j6-qgpj-74h6) — pinned to 3.1.2 via `pnpm.overrides`
  - `fast-uri` host confusion (GHSA-v39h-62p7-jpjc) — same override
  - `ws` DoS (GHSA-96hv-2xvq-fx4p) — bumped to 8.21.0
- Remaining moderate: `postcss <8.5.10` via `geist → next` (GHSA-qx2v-qp2m-jg93). Not actionable without bumping Next.js. Tracked separately.

## Open Items for Next EPIC

Items from the B9-B15 scope not yet done:

| Item | Description | EPIC |
|------|-------------|------|
| B9  | `selectFastest` — latency-based model selector | C |
| B10 | ContextOps — `compressContext` delegation in Vault | C |
| B11 | Auth middleware — bearer token for runtime API | C |
| B12 | Shell allowlist — cmd denylist + cwd restriction | C |
| B13 | Zod input boundaries — validate external payloads at route level | C |
| B14 | SSRF guard — block private IP ranges in HTTP adapter | C |
| B15 | Rate limiting — per-agent token-bucket on API routes | C |

EPIC C (Resiliencia), D (Quality), E (Frontend), F (DevOps) are planned but not started.
