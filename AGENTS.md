# AGENTS.md

This file provides guidance to AI agents (Codex, OpenCode, Claude) when working in this repository.

## Project

**Ninja AI Framework** — local-first AI engineering platform for Windows (commercial, closed development).
Multi-agent orchestration over a single shared runtime, with terminal (Dojo CLI) and web dashboard
(Forge Console) views.

- **Plan Maestro** (source of truth, archived): `docs/architecture/og/Ninja AI Framework v1.0.md`
- **Directiva de Coherencia** (anti-drift, mandatory read): `docs/architecture/coherencia-estructural.md`
- **Quality Manual** (engineering standards, mandatory read): `docs/engineering/QUALITY_MANUAL.md`
- **Trazabilidad de decisiones**: `docs/architecture/fuentes-guia.md`

Read the Directiva and the Quality Manual before making any change. Architecture conflicts resolve per
the Directiva; process/quality conflicts resolve per the Quality Manual.
Current operative plan: `PLAN_EJECUCION.md` · Progress tracker: `tools/enterprise-progress.md`

Stack: TypeScript strict · pnpm 9 workspaces · Turborepo · Fastify · Next.js 16 · better-sqlite3 · Zod · Vitest · Playwright.

## Common Commands

Root-level (run from repo root, all use Turbo unless noted):

```bash
pnpm install                    # workspace install
pnpm build                      # turbo run build (all packages)
pnpm typecheck                  # turbo run typecheck
pnpm lint                       # turbo run lint
pnpm test                       # vitest run --passWithNoTests (NOT turbo)
pnpm test:e2e                   # playwright test (auto-spawns runtime + forge-console)
pnpm format                     # prettier --write .
pnpm clean                      # turbo run clean + rimraf node_modules .turbo
```

App-specific:

```bash
pnpm runtime:dev                # alias: pnpm ninja — kage-runtime on :3141 (tsx watch)
pnpm console:dev                # alias: pnpm forge — forge-console (Next.js dev)
pnpm cli:dev                    # dojo-cli in watch mode
pnpm dojo                       # build + start dojo-cli
pnpm db:migrate                 # workbench migrations against SQLite
pnpm db:studio                  # storage studio
```

Single test (vitest):

```bash
pnpm vitest run packages/vault/src/coordinator.test.ts
pnpm vitest run -t "scoring"            # by test name
pnpm --filter @ninja/kage-engine test   # one package only
```

Per-package build/typecheck:

```bash
pnpm --filter @ninja/<name> build
pnpm --filter @ninja/<name> typecheck
```

E2E targets `localhost:3001` (forge-console) and `localhost:3141` (runtime health).
Playwright auto-starts both via `webServer` in `playwright.config.ts`.

## Monorepo Layout

`apps/` are deployables. `packages/` are libraries consumed via `workspace:*`.
All paths are aliased in both `tsconfig.base.json` and `vitest.config.ts` — keep them in sync.

```
apps/
  kage-runtime/        Fastify HTTP+WS server (:3141). Single composition root.
  dojo-cli/            Terminal launcher (@clack/prompts, inquirer).
  forge-console/       Next.js 16 dashboard (:3001) — React 19 + Tailwind v4 + GSAP.
  companion-extension/ VS Code extension (Cursor/Codex bridge).

packages/
  contracts/           Shared Zod schemas + types. Import everything cross-package from here.
  events/              Typed EventBus singleton. ALL inter-module comms go through it.
  config/ logging/ storage/ common-utils/   Foundation.
  kage-engine/         Orchestration motor (intake → plan → coordinator → approvals).
  flow-matrix/         Workflow executor (sequential + parallel).
  agent-runtime/       Per-agent executor + memory + 11 agent definitions.
  arsenal-registry/    Tools + skills + permission catalog.
  workbench/           Workspace lifecycle + SQLite migrations.
  trace-ledger/        Sessions, runs, artifacts (isAnchor=true → FROZEN memory).
  vault/               4-layer memory COORDINATOR (no compression logic of its own).
  sentinel/            Policy engine + approvals + auditor + guardian.
  pulse-center/        Health, Stability Score, context_efficiency_score, findings.
  model-gateway/       Model catalog + selector + budget + fallback chain.
  learning-loop/       Harvester + evaluator + promoter.
  forge-lab/           Repo analyzer + normalizer + quality scorer.
  office-grid/ ui-kit/ app-shell/   Visual layer (Forge Console depends on these).
  roster/ client-adapters/ delegation-router/ installer/   IDE client integration.
  integrations-engram/    WARM memory adapter (compression in compressor.ts).
  integrations-lightrag/  COLD memory adapter — HTTP → local Python (chunking in chunker.ts).
  integrations-llm/       OpenAI-compatible client (gentle-ai pattern). REQUIRED before any LLM call.
  integrations-shell/ -git/ -fs/ -http/   External-world adapters.
```

Additional directories:

```
docs/
  architecture/        Living governance: coherencia-estructural.md + fuentes-guia.md
  architecture/og/     Archived history: Plan Maestro + old guides + creation transcripts + audits (local-only)
  adr/                 Architecture Decision Records (0001-0008, living)
  engineering/         QUALITY_MANUAL.md — engineering standards (normative)
                       EXECUTION_BATCHES.md — staged execution prompts for free models (operational)
  security/ user/ operations/  Product docs
tools/
  enterprise-progress.md   Progress tracker (single source of truth, keep in sync)
  verifications/           Dossiers per work package (merge ticket — no dossier, no merge)
  audit-deps.ts / profiler.ts  Dev tooling
scripts/
  generate-error-docs.mjs  Generates docs/errors.md (pnpm errors:docs / errors:check)
  start-lightrag.bat       Starts local LightRAG Python process (Windows)
content/               Skills, workflows, templates, source dossiers (product content)
tests/                 Integration + E2E tests + fixtures
PLAN_EJECUCION.md      Operative execution plan (roadmap, phases F0-F5)
```

Removed (2026-08-24 cleanup, non-vital or archived):
`scraping_arriendo/`, `extracted_web/`, `.agents/`, `.playwright-mcp/`, `.claude/`,
`.atl/`, `.vscode/`, `.kiro/`, `.github/` (CI via local hooks), `workspaces/` (runtime scaffold,
recreated at runtime), `logs/` (feedback reports), `CLAUDE.md` (merged into this file),
`.turbo/`, `coverage/`, `playwright-report/` (regenerable caches).

## Big-Picture Architecture

**Single runtime, two surfaces.** Dojo CLI and Forge Console are views of the same `kage-runtime`.
Neither has its own business logic. The runtime composes every package in
`apps/kage-runtime/src/server.ts` — that file is the wiring diagram.

**Event-driven core.** Every module emits/consumes through `@ninja/events`
(`eventBus` singleton, typed via `NinjaEvent<T>` from `@ninja/contracts`).
Never instantiate `EventEmitter` directly.

**4-layer memory (Vault is a coordinator, not an implementer):**
- **HOT** — Agent Runtime in-memory window.
- **WARM** — Engram (5:1 differential compression in `integrations-engram/src/compressor.ts`).
- **COLD** — LightRAG (20:1 semantic chunking in `integrations-lightrag/src/chunker.ts`, local Python via HTTP).
- **FROZEN** — Trace Ledger artifacts with `isAnchor: true`.

Vault exposes exactly 4 ops: `getContext`, `writeContext`, `compressContext` (delegates), `extractAnchors`.
Compression/chunking logic does NOT belong in Vault. No embedding libraries — LightRAG owns embeddings.

**LLM access: Model Gateway → Vault → integrations-llm.** Token budget verified pre-call.
Fallback chain (provider+model swapping on rate limit/quota) is automatic, logged in Trace Ledger.

**11 agents (closed list).** Defined in `packages/agent-runtime/src/definitions.ts`.
Do not invent new agents. `Sentinel` is NOT an agent — it is a supervisor system
(policy + approvals + auditor + guardian). Deprecated names — do not reintroduce:
`Memory Keeper`, `Template Curator`, `Guardian Angel`.

## Non-Negotiable Conventions

Source: `docs/architecture/coherencia-estructural.md` (7 Laws, frozen decisions).

**Native names (never rename):** Kage Engine, Kage Runtime, Dojo CLI, Forge Console, Office Grid,
Arsenal Registry, Flow Matrix, Workbench, Trace Ledger, Sentinel, Model Gateway, Pulse Center,
Learning Loop, Forge Lab, Vault.

**Forbidden dependencies** (use native replacement):
- `axios` / `node-fetch` → `globalThis.fetch`
- `openai` SDK → `@ninja/integrations-llm` (OpenAI-compatible via fetch)
- `express` → Fastify (only in kage-runtime)
- `lodash` → `@ninja/common-utils`
- `winston` → `@ninja/logging`
- Heavy ORMs → `better-sqlite3` + hand-rolled repositories in `@ninja/storage`
- Embedding libraries → none; LightRAG handles embeddings

New dependencies require justification per Directiva §5.3 before install.

**TypeScript strict — no `any`, no `as any`.** Cross-package types in `@ninja/contracts`.
Validate inputs with Zod at module boundaries.

**External sources are studied and re-implemented natively.** Do NOT copy code from
`gentle-ai`, `paperclip`, `miniverse`, etc. Engram and LightRAG are integrated unmodified via adapters.

**Sensitive ops require double approval** (Sentinel + Approvals, per Directiva Ley 6).

## Development Protocol

Work follows the Quality Manual (`docs/engineering/QUALITY_MANUAL.md`): one work package per turn
(Plan Maestro §23), WIP=1, trunk-based with short-lived branches, Conventional Commits, gates
G1 (pre-commit) / G2 (pre-merge) / G3 (pre-release) / G4 (migrations). Each WP ends with a dossier
under `tools/verifications/wp-*.md` — no dossier, no merge.

Definition of Done: naming respected, no scope creep into sibling packages, `pnpm build` +
`pnpm typecheck` green, emits events via `@ninja/events`, dossier filed with evidence.

If you detect deviation from the Plan Maestro, Directiva or Quality Manual: stop and surface it.

## Local Notes

- Runtime: **3141**. Forge Console: **3001**. CORS in `server.ts` is an explicit allowlist — never wildcard.
- `.env` is loaded by walking up from CWD (see `apps/kage-runtime/src/index.ts`). Required: `LLM_BASE_URL`, `LLM_DEFAULT_MODEL`, `LLM_API_KEY`.
- `workspaces/` is created at runtime at the repo root or per-workspace (see `@ninja/workbench`). It is gitignored and regenerable.
- Shell is bash on Windows — use forward slashes and `/dev/null`, not `NUL`.
- Prettier: single quotes, semicolons, width 100, ES5 trailing commas.
- This is a **private, commercial** codebase. No public GH pushes without explicit approval.
  Branch `fix/epic-b-foundations` holds EPIC A+B work pending merge to `main`.
