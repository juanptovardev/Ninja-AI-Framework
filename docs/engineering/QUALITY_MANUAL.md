# Ninja AI Framework — Engineering Quality Manual

> **Version:** 1.0.0 · **Status:** Normative · **Effective:** 2026-08-24
> **Audience:** every contributor — human or AI agent — that reads or writes code in this repository.
> **Authority chain:** Plan Maestro (archived intent, `docs/architecture/og/Ninja AI Framework v1.0.md`) →
> Directiva de Coherencia (`docs/architecture/coherencia-estructural.md` — 7 Laws) →
> **this Manual** (engineering standards) → `PLAN_EJECUCION.md` (roadmap) → `AGENTS.md` (agent onboarding).
> **Conflict rule:** the Directiva wins on architecture and identity; this Manual wins on process, quality and
> delivery. Any deviation requires a written exception (§15).

---

## 0. Purpose, Scope & Authority

This Manual defines **how work is done** in the Ninja AI Framework: the development model, source-control
rules, quality gates, code and testing standards, security SDLC, observability contracts, non-functional
budgets, dependency and release policies, and the traceability and metrics discipline.

It exists because the project is a **private, commercial, closed-development, local-first product for
Windows**. That context removes external safety nets (no public CI, no community review, no vendor
support) and therefore makes **local, self-imposed discipline the only quality mechanism**. The Manual is
that discipline, written down so it survives context loss, agent turnover and memory compaction.

**Scope:** all commits after the effective date, on any branch, by any contributor (human or AI).
**Normative language:** MUST (blocking), SHOULD (default; deviation needs a reason in the dossier),
MAY (option).

---

## 1. Development Model

### 1.1 Work-item lifecycle

Every unit of work is a **work package (WP)** and moves through exactly these states:

```
proposed → specified → in-progress → review → verified → merged → (released)
              (DoR)      (WIP=1)    (checklist)   (DoD)
```

- **proposed:** an item exists in `PLAN_EJECUCION.md` (or the tracker) with an ID, scope and acceptance criteria.
- **specified:** the item satisfies Definition of Ready (§1.5). Work MUST NOT start before this.
- **in-progress:** exactly one item per contributor (§1.3).
- **review:** author runs the review checklist (§1.6) plus adversarial review when §6.3 applies.
- **verified:** all acceptance criteria demonstrably pass, evidence recorded in the dossier.
- **merged:** landed on `main` through Gate 2 (§3). A WP without its dossier is NOT merged.
- **released:** included in a tagged version through Gate 3 (§3.2).

### 1.2 Turn protocol (extends Plan Maestro §23)

One turn = one WP = this sequence, in order:

1. **Read:** Directiva sections relevant to the WP + this Manual's sections relevant to the WP.
2. **Implement:** one module scope, no creep into sibling packages (Directiva DoD).
3. **Verify:** run the acceptance commands; capture output.
4. **Dossier:** write/update `tools/verifications/wp-*.md` (§11.2).
5. **Commit:** through Gate 1, with Conventional Commit message (§2.3).

A turn that cannot finish MUST stop at a green state (typecheck + tests) and record progress in the
dossier — never leave a red tree.

### 1.3 Work-in-progress limits

- **WIP = 1** work package in `in-progress` per contributor.
- Long-running background exploration (read-only agents) is exempt; it MUST NOT modify files.

### 1.4 The three hats

| Hat | Responsibility | Who |
|-----|----------------|-----|
| **Author** | Implements the WP, writes tests, writes the dossier | Any contributor/agent |
| **Reviewer** | Runs the review checklist, adversarial review for sensitive WPs | A different agent/session than the Author — never self-approve sensitive WPs |
| **Release Manager** | Runs release checklist, tags, backups, version bumps | Owner or delegated agent |

For a single-operator project, the Reviewer hat MAY be the same human wearing a different session
(e.g. a fresh agent with no implementation context). The rule being enforced: **the reviewer must not
have the implementation in its context.**

### 1.5 Definition of Ready (DoR)

A WP is `specified` when ALL hold:

- [ ] Scope written as file paths and behavior, not vague intent.
- [ ] Acceptance criteria are **commands with expected output**, not prose.
- [ ] Affected packages identified; no scope into sibling packages (Directiva).
- [ ] If new dependency → §9.2 justification drafted.
- [ ] If sensitive surface (§6.1) → STRIDE-lite table drafted.
- [ ] Estimate recorded (P50/P80 in working hours or days).

### 1.6 Definition of Done (DoD) — per artifact type

**Generic DoD (all types):**
- [ ] `pnpm typecheck` green · `pnpm test` green · `pnpm errors:check` green (Gate 2).
- [ ] No new `any`/`as any` (§4.1) · no new `throw new Error(` outside allowed files (§4.3).
- [ ] Dossier updated with evidence (commands + output summary).
- [ ] Docs touched in the same turn if behavior changed (§11.3).

**Feature:**
- [ ] Unit tests for new behavior; integration test when the runtime composition changes.
- [ ] Emits events via `@ninja/events` if anything observable happened (Directiva Ley 3).
- [ ] Inputs validated with Zod at the module boundary.

**Bugfix:**
- [ ] Red→green: a failing test capturing the bug lands in the same commit as the fix.
- [ ] Root cause stated in the dossier; workaround vs fix distinguished.

**DB migration:**
- [ ] Up AND down paths implemented; migration test (§3 Gate 4).
- [ ] Backup taken before applying (§10.4).
- [ ] Trace Ledger / storage repos updated in the same WP.

**Dependency change:**
- [ ] §9.2 justification + license check (§9.3) in the dossier.
- [ ] `pnpm-lock.yaml` committed together; `pnpm audit --prod` re-run.

**Docs-only:**
- [ ] Claims verified against the code at HEAD (no stale numbers).
- [ ] If docs describe reality that does not exist yet → mark explicitly as target state.

---

## 2. Source Control

### 2.1 Branching model — trunk-based

- `main` is the only long-lived branch and the single source of truth.
- All work happens on short-lived branches merged back to `main`.
- `main` MUST be green at every merge (Gate 2). No direct pushes to `main` except merges.
- **Historical note:** `fix/epic-b-foundations` (92 commits, EPIC A+B) is a legacy long-lived branch;
  it is merged and retired in `PLAN_EJECUCION.md` F0.8. Long-lived branches are an anti-pattern from
  this Manual's effective date.

### 2.2 Branch naming and lifetime

Format: `type/wp-id-slug`

```
feat/wp-c3-health-readiness     fix/cors-x-ninja-key       chore/lint-flat-config
docs/adr-0011-rate-limit        refactor/server-routes     hotfix/v0.9.1-auth-header
```

- **Lifetime:** ≤ 3 calendar days OR ≤ 20 commits — whichever first. Beyond that, split into smaller WPs.
- Branch names are lowercase, kebab-case, ASCII.

### 2.3 Commit conventions — Conventional Commits

```
<type>(<scope>): <subject, imperative, ≤72 chars, lowercase>

[optional body: why, not what]
[optional footer: refs WP/ADR]
```

- **type:** feat · fix · refactor · test · docs · chore · perf · security
- **scope:** package name without `@ninja/` (`kage-engine`, `contracts`) or app name (`kage-runtime`,
  `forge-console`, `dojo-cli`). Multi-scope allowed for cross-cutting WPs: `feat(common-utils,integrations-llm): ...`
- One logical change per commit. A commit SHOULD leave the tree green.
- Breaking changes: `!` after type + `BREAKING CHANGE:` footer + CHANGELOG entry.
- Reference discipline: footer `Refs: WP-C2, ADR-0010` whenever a dossier/ADR exists.

### 2.4 What MUST never be committed

Secrets (`.env`, `*.key`, tokens) · build artifacts (`dist/`, `.next/`, `.turbo/`) · `node_modules/` ·
coverage/playwright reports · `docs/architecture/og/` archives · `workspaces/` runtime data ·
databases (`*.db*`) · IDE/agent-local config (`.claude/`, `.atl/`, `.kiro/settings/`) ·
anything containing personal data not needed by the product.

Enforcement: `.gitignore` rules + pre-commit hook + §6.5 secret scan at Gate 3.

---

## 3. Quality Gates Matrix

Development is closed and local-first: there is **no remote CI**. Gates run locally and are enforced by
git hooks once `PLAN_EJECUCION.md` F1 installs them. Until then, gates run manually — skipping a gate
manually is a §15 exception, not a shortcut.

### 3.1 The four gates

| Gate | When | Commands (all must exit 0) | Enforced by |
|------|------|---------------------------|-------------|
| **G1 — pre-commit** | every `git commit` | `lint-staged`: prettier --write + eslint --fix on staged files | husky pre-commit |
| **G2 — pre-merge** | before merge to `main` (pre-push) | `pnpm typecheck && pnpm test && pnpm errors:check` | husky pre-push |
| **G3 — pre-release** | before tagging a version | `pnpm build && pnpm test:e2e && pnpm audit --prod` + backup bundle + CHANGELOG updated | Release checklist §10.2 |
| **G4 — migration** | before applying any DB migration | backup of DB file + up/down both tested + migration test green | Migration DoD §1.6 |

### 3.2 Failure policy

- A red gate blocks the action. Period.
- `--no-verify` is forbidden outside a §15 exception recorded in the dossier.
- If a gate is red for environmental reasons (e.g. port conflict in E2E), fix the environment or
  quarantine the test (§5.4) — never bypass the gate.

### 3.3 Hotfix path

1. Branch `hotfix/vX.Y.Z-slug` from the affected tag.
2. Fix with red→green test (bugfix DoD).
3. Gates G1+G2 (G3-lite: `pnpm build` + targeted tests).
4. Merge to `main`, tag patch version, CHANGELOG entry, bundle backup.
5. Postmortem line in the release dossier: root cause + prevention.

### 3.4 Enforcement note (closed development)

All gates are local. Two consequences:

- Hooks MUST be installed (F1) — a repo without hooks is a repo without gates.
- The Release Manager re-runs G2+G3 manually at phase gates; hook presence is verified with
  `ls .husky/` and a dry-run commit on a scratch branch.

---

## 4. Code Standards

### 4.1 Language discipline

- TypeScript `strict: true`. **`any` and `as any` are forbidden** — target count: 0
  (baseline 2026-08-24: 117). ESLint `no-explicit-any` and `@typescript-eslint/no-unsafe-*` family
  set to `error` (F1).
- Cross-package types live in `@ninja/contracts`. A type needed by two packages MUST be promoted to
  contracts, not duplicated.
- Public APIs of every package are exported through `src/index.ts` only.

### 4.2 Dependency direction (layer rules)

Five layers; **imports only point downwards**:

```
L0 contracts            (imports nothing internal)
L1 foundation           config · logging · storage · events · common-utils · vault*
L2 domain               kage-engine · agent-runtime · flow-matrix · arsenal-registry ·
                        workbench · trace-ledger · sentinel · model-gateway · pulse-center ·
                        learning-loop · forge-lab · roster
L3 integration          integrations-llm · -engram · -lightrag · -shell · -git · -fs · -http ·
                        client-adapters · delegation-router · installer
L4 apps                 kage-runtime · forge-console · dojo-cli · companion-extension
Visual (side-layer):    ui-kit · office-grid · app-shell — consumed ONLY by forge-console
```

Rules:
- L(n) MUST NOT import from L(n+1) or higher. Enforced via ESLint `no-restricted-imports` patterns (F1).
- `vault` is foundation but MUST NOT contain compression/chunking logic (Directiva §2.3) — it coordinates.
- Apps MUST NOT contain business logic that belongs in a package (Directiva Ley 2).
- Exceptions (if ever needed): ADR + §15 entry.

### 4.3 Error handling

- **Only `NinjaError` subclasses may be thrown** in `packages/` and `apps/` (baseline exceptions:
  legacy `throw new Error(` count: 45 — target 0; existing ESLint guard covers migrated files and
  MUST be extended with each migration).
- Every new error gets: `ErrorCode` in the catalog (`packages/contracts/src/errors.ts`), domain,
  `httpStatus`, `retryable` flag — and `docs/errors.md` regenerated (`pnpm errors:docs`).
- HTTP replies go through `sanitizeError` (never leak stacks in production) — `error-handler.ts` owns this.
- **Empty `catch` blocks are forbidden.** Handle, wrap-and-rethrow as NinjaError, or log with context.
- Adapters wrap external failures into their native error type at the boundary (e.g. LLMError).

### 4.4 Structural budgets

| Metric | Budget | Enforcement |
|--------|--------|-------------|
| Cyclomatic complexity per function | ≤ 10 | lint rule (F1) |
| Function length | ≤ 50 lines | review checklist |
| File length | ≤ 400 lines | review checklist |
| Route handlers inline in composition root | 0 (extract to `routes/`) | tracked debt F3.4 |

Composition root budget enforced: `apps/kage-runtime/src/server.ts` is **394** non-blank
lines (was 1022; decomposed in T6.3–T6.4, EXC-1 CLOSED). It MUST NOT grow: new routes go
to `apps/kage-runtime/src/routes/*.ts` from now on. Count with `(Get-Content server.ts | Measure-Object -Line).Lines`.

### 4.5 Events and contracts

- Everything observable emits via `@ninja/events` `eventBus` (Directiva Ley 3). A module that changes
  state silently is incomplete.
- New event names are typed in `@ninja/contracts` (Zod-validated payloads at boundaries).
- Inputs from HTTP/WS are validated with Zod schemas before use (route-schemas pattern, WP-B15).

### 4.6 Naming

Directiva §1.2 native names are frozen: never rename, abbreviate or translate module names or the
11-agent closed list. Deprecated names (`Memory Keeper`, `Template Curator`, `Guardian Angel`) MUST
NOT reappear.

---

## 5. Testing Strategy

### 5.1 Pyramid and targets

| Layer | What | Tool | Target |
|-------|------|------|--------|
| Unit | packages' internals, pure logic | Vitest | **70% lines** in critical packages: contracts, kage-engine, agent-runtime, sentinel, model-gateway, vault, flow-matrix, integrations-* |
| Unit (rest) | visual + support packages | Vitest | smoke-level acceptable; **50% lines global floor** |
| Integration | runtime composition (server wiring, event flow, pipelines) | Vitest + http injection | key flows covered: lifecycle, event-flow, security, fallback |
| E2E | user journeys through Forge Console + runtime | Playwright | suite ≤ 10 min; happy paths + approval flow + build mode |

- Coverage is measured with `vitest --coverage` (v8 provider, config already present).
- Thresholds land in F3.3 — **after** test suites exist (R6 rule: suites before thresholds).

### 5.2 Contract tests

`@ninja/contracts` is the API of the whole system. Every schema MUST have a round-trip/parse test
(valid input → parse → serialize; invalid input → typed failure). A breaking change to contracts =
`feat!` + ADR + CHANGELOG breaking section.

### 5.3 E2E budget

- Total Playwright runtime ≤ 10 minutes on the dev machine (baseline hardware: the owner's workstation).
- E2E MUST NOT depend on real LLM calls — they mock the LLM boundary (env-flagged stub or route-level
  mock) so the suite is deterministic and offline.

### 5.4 Flaky and skipped tests

- Flaky test → quarantine: `it.skip` + `// QUARANTINE: reason, issue ref, expiry ≤ 1 phase`.
- **Zero non-quarantined skips on `main`.** (Baseline: 1 skip in `runtime-lifecycle.test.ts` — resolved in F1.6.)
- A quarantine past expiry blocks the phase gate.

### 5.5 Test hygiene

- Mocks/factories live in `tests/helpers/` (existing `mock-event-bus.ts`, `mock-llm-client.ts`) —
  reuse before writing new ones. Known bug to respect: `MockEventBus.off` (EV-21) — being fixed in F3.
- Tests MUST NOT: hit real networks (except mocked), sleep arbitrarily (use fake timers), depend on
  execution order, or share mutable singletons without reset.
- Bugfixes: red→green in the same commit (§1.6).

---

## 6. Security SDLC

### 6.1 Sensitive surface

The following areas are **sensitive** — changes there trigger §6.2 + §6.3:

`integrations-shell` (command execution) · `integrations-fs` (path boundary) · `integrations-http`
(SSRF) · `integrations-git` · `integrations-llm` (credentials in flight) · auth (`auth-key.ts`,
onRequest hook) · approvals (`/api/approvals/*`) · CORS config · DB migrations · sandbox/allowlists.

### 6.2 Threat modeling — STRIDE-lite

Every WP touching the sensitive surface includes this table in its dossier:

| Threat (STRIDE) | Vector in this change | Control | Test proving the control |
|-----------------|----------------------|---------|--------------------------|

Six rows filled (or explicitly "N/A — no exposure"), e.g. for a shell-executor change:
Spoofing → forged workspace cwd → `assertWithinBoundary` + cwd-must-be-under-workspace → test name.

### 6.3 Mandatory adversarial review

Changes to auth, approvals, sandbox/allowlists, SSRF guard, or migrations REQUIRE a second,
implementation-blind review session (the "Reviewer hat", §1.4) that actively tries to break the
change: bypass the header, escape the boundary, race the timeout. Findings → tests before merge.
(The repository's `judgment-day` dual-review pattern is the reference protocol.)

### 6.4 Vulnerability SLAs

| Severity (pnpm audit) | Fix deadline |
|----------------------|--------------|
| Critical | 24 h |
| High | 72 h |
| Moderate | current phase |
| Low | backlog (triaged monthly) |

`pnpm audit --prod` runs at Gate 3 and weekly (F5.5 schedules it; until then, manual, Fridays).

### 6.5 Secret hygiene

- Secrets only via `.env` (gitignored) or `~/.ninja/runtime.key`. Never in code, tests, dossiers, or
  commit messages.
- Pre-release secret scan (Gate 3): `git grep -IE "sk-[A-Za-z0-9]{10,}|api[_-]?key\s*[:=]|Bearer [A-Za-z0-9]{15,}" $(git rev-list -20)` → 0 hits.
- New env vars MUST enter `EnvSchema` (Zod, fail-fast) — no undocumented config surface.

### 6.6 OWASP Top 10 — local-first adaptation

| OWASP category | Adaptation for this product |
|----------------|------------------------------|
| Injection | Shell args validated per-command (allowlist + regex, `&\|;` guard on Windows) — keep extending tests |
| Broken access control | Approver identity real (no hardcoded admin); auth hook exempt-list reviewed per change |
| Cryptographic failures | Runtime key: randomBytes(32); storage exception §6.7 |
| SSRF | `ssrf-guard.ts` — private/reserved ranges + IPv4-mapped IPv6 + metadata endpoints |
| Security misconfiguration | CORS explicit allowlist incl. `X-Ninja-Key`; never wildcard; helmet-style headers (F2.6) |
| Vulnerable components | §9.5 audit cadence + §6.4 SLAs |
| Logging failures | §7: no secrets in logs; audit events immutable once persisted (F2.5) |

### 6.7 Standing security exceptions

| # | Exception | Compensating control | Expiry |
|---|-----------|---------------------|--------|
| SEC-1 | Runtime key stored plaintext `~/.ninja/runtime.key` (no Windows ACL hardening) | single-user local-first; file perms on POSIX; key never in logs | v1.5 (revisit with packaging work) |
| SEC-2 | Forge Console receives runtime key via `NEXT_PUBLIC_RUNTIME_API_KEY` (browser-visible) | localhost-only deployment; CORS allowlist; auth handshake 5 s | v1.5 (session-token model) |

New exceptions: §15 format, reviewed at every phase gate.

---

## 7. Observability

### 7.1 Log format

Target (landed with F2): **structured JSON, one event per line**:

```json
{"ts":"2026-08-24T21:00:00.000Z","level":"info","logger":"kage-runtime","msg":"run started","correlationId":"...","runId":"..."}
```

Fields: `ts` (ISO 8601) · `level` · `logger` (module name) · `msg` · plus context keys.
The hand-rolled console logger is replaced/extended in F2 — user-facing docs MUST match the actual
format (known drift: `troubleshooting.md` describes JSON logs that do not exist yet — fixed in F2).

### 7.2 Correlation

- `correlationId` per HTTP request (Fastify `genReqId`) and per WS session.
- `sessionId` / `runId` on engine/engine-run events.
- Correlation IDs propagate into Trace Ledger artifacts (Ley 7 trazabilidad).

### 7.3 Levels and usage

| Level | Use | Notes |
|-------|-----|-------|
| debug | dev-only detail | never in production default level |
| info | lifecycle (start/stop, run created, approval resolved) | |
| warn | recoverable degradation (fallback triggered, circuit half-open) | |
| error | unhandled failure requiring attention | always with error code if NinjaError |

### 7.4 Health endpoints

- `GET /health` — **liveness**: process is up. Static, fast, no dependencies.
- `GET /health/ready` — **readiness**: SQLite probe (`SELECT 1`), migrations applied, LLM env present
  (F2.1). Readiness flips false when a dependency dies — WS/UI consume it.

### 7.5 Forbidden content in logs

API keys, full LLM request/response payloads (truncate to sizes), tokens, absolute personal paths
beyond what diagnostics require, PII. Dossiers follow the same rule.

---

## 8. Non-Functional Requirement Budgets

Measured on the dev workstation (the reference machine), targets enforced from F2 onward.

### 8.1 Performance

| Metric | Budget | How measured |
|--------|--------|--------------|
| Runtime cold start → `/health` 200 | < 5 s (excluding LLM calls) | measure with `time`-style timestamp in lifecycle log |
| API p95 latency (non-LLM routes) | < 50 ms | lightweight timing middleware log (F2) |
| WS round-trip (emit→client) | < 100 ms local | E2E probe test |
| Forge Console LCP (dev) | < 2.5 s | Playwright trace |
| Office Grid animation | 60 fps, transform/opacity only, ≤ 500 grid DOM nodes | manual + trace spot-check |

### 8.2 Compatibility matrix

| OS | Node | Status |
|----|------|--------|
| Windows 10 | 22 LTS (pinned via `engines` + `.nvmrc`) | primary — must pass G2+G3 |
| Windows 11 | 22 LTS | primary |
| Windows 10/11 | 24 | best-effort, no guarantee in v1 |

Cross-platform (mac/linux) is out of scope for v1; code MUST NOT gain POSIX-only assumptions anyway.

### 8.3 Accessibility

Forge Console targets **WCAG 2.1 AA**: keyboard-navigable (focus rings visible — baseline exists),
`aria-label` on icon actions, contrast ≥ 4.5:1, no information conveyed by color alone, dialogs trap
focus (Radix primitives already used — keep it). New pages ship with a manual a11y pass in the dossier.

### 8.4 Resource ceilings

Runtime baseline RSS < 500 MB (idle). SQLite DB size is monitored but uncapped (local-first product);
a `db:size` warn log appears at 500 MB (F2.5).

---

## 9. Dependency Management

### 9.1 Approved and forbidden

- Approved stack: Directiva §4.1 (Fastify, Zod, better-sqlite3, tsup, Vitest, Playwright, Next.js,
  React, Tailwind, GSAP, pnpm/Turbo).
- Forbidden: Directiva §4.2 — `axios`/`node-fetch` (use `globalThis.fetch`), `openai` SDK (use
  `@ninja/integrations-llm`), `express`, `lodash` (use `@ninja/common-utils`), `winston` (use
  `@ninja/logging`), heavy ORMs, embedding libraries, text-compression libraries.

### 9.2 Addition process

New dependency requires, in the dossier: (1) need not solvable natively in ≤ ~50 LoC, (2) alternatives
considered, (3) license (§9.3), (4) install size, (5) maintenance health. Runtime dependencies also
require an ADR. Dev-only tooling (husky, lint-staged) needs the dossier justification only.

### 9.3 License policy (commercial product)

- **Allowed:** MIT, ISC, Apache-2.0, BSD-2/3, 0BSD, Unlicense, CC0.
- **Forbidden:** GPL-2/3, LGPL, AGPL, SSPL, BUSL, any copyleft/network-copyleft, unlicensed packages,
  "source available" with commercial restrictions.
- Verified at addition time and re-checked at Gate 3 via `pnpm licenses list` spot-check.

### 9.4 Update policy

- **patch:** freely, with lockfile, G2 re-run.
- **minor:** dedicated WP or bundled in a phase, notes in dossier.
- **major:** ADR + migration plan (examples: Next 16→17, Fastify 5→6).

### 9.5 Auditing

`pnpm audit --prod`: Gate 3 + weekly cadence + §6.4 SLAs. Results recorded in
`docs/security/dependency-audit.md` when actionable.

---

## 10. Versioning & Release

### 10.1 SemVer and lockstep

- SemVer 2.0. Until v1.0 feature-complete: **lockstep 0.x** — all 32 packages share one version
  (`0.9.x` now; `1.0.0` at the end of F5). Post-1.0: independent versions allowed if divergence is
  justified.
- All packages and apps carry `"private": true` (anti-accidental-publish). No npm publishing, ever —
  distribution is via Windows packaging (F5).

### 10.2 Release checklist (Gate 3)

1. G2 green · G3 commands green (`pnpm build`, `pnpm test:e2e`, `pnpm audit --prod`).
2. Secret scan (§6.5) → 0 hits.
3. `CHANGELOG.md` updated (Keep-a-Changelog sections; breaking changes prominent).
4. Version bumped (lockstep) in all `package.json`.
5. Tag: `vX.Y.Z` (annotated) on `main`.
6. Backup bundle created (§10.4).
7. Push (only with owner confirmation that remote is Private — §0 context).

### 10.3 Rollback runbook

1. `git revert` the release-range commits on `main` (never force-push history).
2. If DB migrations shipped: restore DB file from the pre-release backup taken at Gate 4; if data
   written since, export via storage repo scripts first (documented per migration).
3. Rebuild (`pnpm build`), verify `GET /health/ready` green.
4. Tag `vX.Y.Z+1` with the revert, CHANGELOG entry.
5. Postmortem section in the release dossier: cause, detection time, fix time, prevention.

### 10.4 Backup cadence

- `git bundle create <secondary-drive>/ninja-backup-<date>.bundle --all` after **every phase gate**
  and **weekly** (Task Scheduler once F5.5, manual until then).
- Secondary drive ≠ the repo drive. Bundles are the disaster-recovery mechanism for a closed,
  single-machine development model. Bundle presence is a phase-exit criterion.

---

## 11. Documentation Standards

### 11.1 ADRs

`docs/adr/NNNN-slug.md` from `_template.md`. An ADR is REQUIRED for: new runtime dependency ·
breaking contracts change · security decision · any deviation from the Directiva's frozen decisions.
ADRs are immutable once accepted; supersede, never edit history. (Current: 0001–0008 committed;
0009–0010 on disk pending F0.1/F0.2.)

### 11.2 Work-package dossiers

`tools/verifications/wp-<id>.md` — minimum fields:

```
# WP <id> — <title>
Scope: files touched · Decisions: with rationale ·
Evidence: acceptance commands + output summary ·
Security: STRIDE-lite table if §6.1 ·
Risks/Notes · Refs: ADRs, related WPs, EV ledger items
```

The dossier is written by the Author and is the merge ticket. No dossier, no merge.

### 11.3 Docs-code sync

Behavior changes update docs in the same turn: README claims, troubleshooting, AGENTS.md layout,
error catalog (`pnpm errors:docs` when ErrorCodes changed). Stale docs are defects with the same
priority as stale code. (Known drift baseline: README test-count and phase-status — fixed in F0.6.)

### 11.4 Generated docs

`docs/errors.md` is generated — never hand-edit; regenerate via `pnpm errors:docs` and let
`pnpm errors:check` guard drift in G2.

---

## 12. Risk Management

### 12.1 Risk record format

```
ID | description | probability (1-5) | impact (1-5) | score (P×I) |
trigger (observable signal) | detection (command/check) | mitigation | owner hat | status
```

### 12.2 Thresholds

- score ≥ 12 → active mitigation REQUIRED before the owning phase can exit.
- 9–11 → monitored; mitigation planned.
- < 9 → recorded, accepted.

### 12.3 Review cadence

Risks are re-scored at every phase gate in `PLAN_EJECUCION.md` §9 (the living register); changes
noted in the phase dossier. New risks discovered mid-phase are added immediately, not deferred.

---

## 13. Traceability

### 13.1 The chain

```
EPIC → WP (id) → ADR(s) → tests (named) → dossier (tools/verifications/) → commits (scope in message)
```

Every code change MUST be reachable through this chain, and every dossier MUST point at code that
exists. The EV ledger from the archived ENTERPRISE-MASTER plan is absorbed into
`PLAN_EJECUCION.md` §8 (traceability matrix) — EV items keep their IDs for continuity.

### 13.2 Living matrix

`tools/enterprise-progress.md` + `PLAN_EJECUCION.md` §8 together form the living matrix; the progress
tracker records status, the plan records the chain. Both are updated in the same turn as the WP closes
(known baseline drift fixed in F0.6).

### 13.3 Orphan rule

Code without dossier/ADR where required = incomplete WP (blocks merge). Dossier describing code that
no longer exists = stale doc defect (§11.3).

---

## 14. Metrics & Reporting

### 14.1 KPI re-measurement commands

Run from repo root (bash on Windows; PowerShell equivalents in parentheses where they differ):

```bash
git status --porcelain | wc -l                                            # dirty files (target 0)
git grep -o "as any" -- "*.ts" | wc -l                                    # as-any count (target 0)
git grep -o "throw new Error(" -- "packages/**/*.ts" | wc -l              # raw throws in packages (target 0)
for d in packages/*/; do [ -z "$(git ls-files "${d}src/**/*.test.ts")" ] && echo "$d"; done   # packages without tests
git grep -oE "alert\(|confirm\(" -- "apps/forge-console" | wc -l          # native dialogs (target 0)
pnpm vitest run --reporter=basic 2>&1 | tail -5                           # suite status
```

### 14.2 DORA-lite

| Metric | Definition (adapted) | Source |
|--------|---------------------|--------|
| Lead time for WP | first commit on the WP branch → merge | branch + merge timestamps |
| Change failure rate | hotfixes ÷ releases | tags + hotfix branches |
| MTTR | incident detected → hotfix tagged | postmortem sections |

Collected per phase into the phase dossier. Pragmatic adaptation of a single-operator, single-machine
context — no dashboards, just honest numbers in the record.

### 14.3 Reporting cadence and honesty

- KPIs re-measured at every phase gate; numbers recorded as measured (§14.1 commands' raw output),
  never as hoped.
- Discovered regressions in metrics are risks (§12) the moment they are seen.

---

## 15. Deviations & Exceptions

### 15.1 Exception format

Any gate bypass, budget overrun, or Manual deviation:

```
EXC-<seq>: what was bypassed | why | compensating control | expiry (≤ 1 phase) | approved by (owner)
```

Recorded in the WP dossier AND the standing registry below.

### 15.2 Standing exceptions registry

| # | Exception | Compensating control | Expiry |
|---|-----------|---------------------|--------|
| EXC-1 | ~~`server.ts` exceeds file budget (1022 lines)~~ | **CLOSED** — T6.3/T6.4 decomposed to 394 lines, as-any 0 | T6.4 ✅ |
| SEC-1/SEC-2 | see §6.7 | see §6.7 | v1.5 |
| EXC-2 | ~~1 quarantined test (`runtime-lifecycle` shutdown skip)~~ | **CLOSED** — F1.6, 0 skips in repo | F1.6 ✅ |
| EXC-3 | office-grid line coverage 33.82% (`use-office-state.ts` 0/137 stmts; React hook + WS + fetch) | `grid-logic.ts` 100% as pure mirror of the hook reducer; honest gap in `wp-d3-ui.md`. T6.2 MUST `coverage.exclude` this hook (comment `EXC-3`). **Forbidden:** jsdom / Testing Library / lowering the global 50% threshold to hide the gap. | Future WP with Manual §9.2 jsdom justification — not D4 |
| EXC-4 | 15 files with PRE-EXISTING layer violations (`no-restricted-imports`) grandfathered via `DEBT(T6.4)` block in `eslint.config.mjs` | Scoped override (exact file list + justification in config); worker-added violations = 0 (mapped); fixes triviales aplicados. **Forbidden:** añadir archivos a la lista sin dossier; relajar la regla global (`allowTypeImports` rechazado, precedente T5.3). Decisión: ADR-0013. | Revisión ADR de capas |

### 15.3 Expiry

Expired exceptions become schedule-able debt in `PLAN_EJECUCION.md` automatically at the phase gate
where they expire. An exception cannot be renewed silently twice — the second renewal requires the
owner's explicit decision recorded in the dossier.

---

*End of Quality Manual v1.0.0. Amendments via ADR or versioned edit with a CHANGELOG entry in this
file's header. The Directiva (`docs/architecture/coherencia-estructural.md`) remains the supreme
architectural authority; this Manual governs everything the Directiva does not.*
