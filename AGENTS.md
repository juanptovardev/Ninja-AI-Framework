# AGENTS.md

Guidance for AI agents (Codex, OpenCode, Claude) working in this repository.
**Ninja AI Framework** — local-first AI engineering platform for Windows (commercial, closed development).
Multi-agent orchestration over a single shared runtime, with terminal (Dojo CLI) and web dashboard
(Forge Console) views.

## 0. Startup Reading Order (mandatory on a fresh session)

1. This file. 2. `docs/architecture/coherencia-estructural.md` (7 Laws, frozen decisions).
2. `docs/engineering/QUALITY_MANUAL.md` (engineering standards, normative).
3. `PLAN_EJECUCION.md` §1 (where the project stands NOW) + `docs/engineering/ESTADO_ORQUESTACION.md`.
4. `docs/engineering/EXECUTION_BATCHES.md` (frozen prompts of the active stage) — only if executing a stage.
5. `docs/engineering/GUIA_ORQUESTACION_IA.md` — only if orchestrating workers (ORCA cycle, §Orchestration).

**Conflict hierarchy:** Directiva (architecture) > Quality Manual (process) > `PLAN_EJECUCION.md`

> this file > orchestration guide. Never contradict a higher layer; surface the deviation instead.

Stack: TypeScript strict · pnpm 9 workspaces · Turborepo · Fastify · Next.js 16 · better-sqlite3 ·
Zod · Vitest · Playwright. Runtime **:3141** · Forge Console **:3001**.

## Doc Map (single source of truth per topic)

| Topic                                                  | File                                                     |
| ------------------------------------------------------ | -------------------------------------------------------- |
| Operative roadmap, phases F0–F5, KPIs, changelog       | `PLAN_EJECUCION.md`                                      |
| Frozen stage prompts A-n/T-n.m/C + execution guides    | `docs/engineering/EXECUTION_BATCHES.md`                  |
| Orchestration protocol (workers, merges, audits)       | `docs/engineering/GUIA_ORQUESTACION_IA.md`               |
| Visual tokens/components (read before ANY UI change)   | `docs/engineering/CONSISTENCIA_VISUAL.md`                |
| Reusable-function catalog (search BEFORE writing code) | `docs/engineering/TRACE_FUNCIONES.md`                    |
| Progress tracker (keep in sync)                        | `tools/enterprise-progress.md`                           |
| Dossiers per work package (no dossier, no merge)       | `tools/verifications/wp-*.md` + `cierre-etapa-N.md`      |
| Architecture decisions (new decision = new ADR)        | `docs/adr/` (0001–0012, living)                          |
| Error-code catalog (generated)                         | `docs/errors.md` via `pnpm errors:docs` / `errors:check` |
| Archived history (local-only, not normative)           | `docs/architecture/og/`                                  |

## Common Commands (repo root; all Turbo unless noted)

```bash
pnpm install                    # workspace install
pnpm build                      # turbo run build (all packages)
pnpm typecheck                  # turbo run typecheck
pnpm lint                       # turbo run lint
pnpm test                       # vitest run (NOT turbo)
pnpm test:e2e                   # playwright (auto-spawns runtime + forge-console)
pnpm errors:check               # error catalog in sync (must stay green)
pnpm format                     # prettier --write .
pnpm clean                      # turbo run clean + rimraf node_modules .turbo
```

```bash
pnpm runtime:dev                # alias: pnpm ninja — kage-runtime on :3141 (tsx watch)
pnpm console:dev                # alias: pnpm forge — forge-console (Next.js dev)
pnpm cli:dev                    # dojo-cli in watch mode
pnpm dojo                       # build + start dojo-cli
pnpm db:migrate / pnpm db:studio # workbench migrations / storage studio
pnpm vitest run packages/vault/src/coordinator.test.ts   # single file
pnpm vitest run -t "scoring"                             # by test name
pnpm --filter @ninja/<name> build|typecheck|test          # one package
```

E2E targets `localhost:3001` (forge-console) and `localhost:3141` (runtime health);
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

`docs/` living governance (`architecture/`, `adr/`, `engineering/`, `security/`, `user/`, `operations/`);
`tools/` progress + verifications + dev tooling; `scripts/` (`generate-error-docs.mjs`,
`start-lightrag.bat`); `content/` product content; `tests/` integration + E2E + fixtures;
`PLAN_EJECUCION.md` operative plan. Removed 2026-08-24 (~3.5GB, non-vital/archived):
`scraping_arriendo/`, `extracted_web/`, `.agents/`, `.playwright-mcp/`, `.claude/`, `.atl/`,
`.vscode/`, `.kiro/`, `.github/` (local hooks instead), `workspaces/` (recreated at runtime),
`logs/`, `CLAUDE.md`, `.turbo/`, `coverage/`, `playwright-report/`.

## Big-Picture Architecture

**Single runtime, two surfaces.** Dojo CLI and Forge Console are views of the same `kage-runtime`.
Neither has business logic. The runtime composes every package in
`apps/kage-runtime/src/server.ts` — that file is the wiring diagram.

**Event-driven core.** Every module emits/consumes through `@ninja/events`
(`eventBus` singleton, typed via `NinjaEvent<T>` from `@ninja/contracts`).
Never instantiate `EventEmitter` directly.

**4-layer memory (Vault coordinates, never implements):**

- **HOT** — Agent Runtime in-memory window.
- **WARM** — Engram (5:1 differential compression in `integrations-engram/src/compressor.ts`).
- **COLD** — LightRAG (20:1 semantic chunking in `integrations-lightrag/src/chunker.ts`, local Python via HTTP).
- **FROZEN** — Trace Ledger artifacts with `isAnchor: true`.

Vault exposes exactly 4 ops: `getContext`, `writeContext`, `compressContext` (delegates),
`extractAnchors`. No embedding libraries — LightRAG owns embeddings.

**LLM access: Model Gateway → Vault → integrations-llm.** Token budget verified pre-call;
fallback chain is automatic, logged in Trace Ledger.

**11 agents (closed list)** in `packages/agent-runtime/src/definitions.ts` — do not invent new ones.
`Sentinel` is NOT an agent (supervisor: policy + approvals + auditor + guardian).
Deprecated — never reintroduce: `Memory Keeper`, `Template Curator`, `Guardian Angel`.

## Non-Negotiable Conventions

Source: `docs/architecture/coherencia-estructural.md` (7 Laws, frozen decisions).

**Native names (never rename):** Kage Engine, Kage Runtime, Dojo CLI, Forge Console, Office Grid,
Arsenal Registry, Flow Matrix, Workbench, Trace Ledger, Sentinel, Model Gateway, Pulse Center,
Learning Loop, Forge Lab, Vault.

**Forbidden dependencies** (use native replacement): `axios`/`node-fetch` → `globalThis.fetch`;
`openai` SDK → `@ninja/integrations-llm`; `express` → Fastify (runtime only); `lodash` →
`@ninja/common-utils`; `winston` → `@ninja/logging`; heavy ORMs → `better-sqlite3` + hand-rolled
repositories in `@ninja/storage`; embedding libraries → none. New deps need justification per
Directiva §5.3 before install.

**TypeScript strict — no `any`, no `as any`.** Cross-package types in `@ninja/contracts`.
Validate inputs with Zod at module boundaries.

**Reuse-first (§TRACE_FUNCIONES):** before any feature/fix, search the catalog + `packages/*/src`;
≥80% overlap = import/extend/compose, never rewrite. New reusable code is registered in the
catalog **in the same commit**. Duplicated functionality = audit rejection.

**Visual consistency (§CONSISTENCIA_VISUAL):** read it before touching any
`.tsx`/`.css` in `forge-console`, `office-grid`, `ui-kit`, `app-shell`. New tokens/components
are recorded there first, implemented after.

**External sources are studied and re-implemented natively.** Do NOT copy code from
`gentle-ai`, `paperclip`, `miniverse`, etc. Engram and LightRAG integrate unmodified via adapters.

**Sensitive ops require double approval** (Sentinel + Approvals, Directiva Ley 6).

## Development Protocol

One work package per turn (Plan Maestro §23), WIP=1, trunk-based `main`, short branches
`feat|fix/wp-<id>-<slug>`, Conventional Commits. Gates: G1 pre-commit (lint-staged) /
G2 pre-merge = pre-push (`typecheck && test && errors:check`) / G3 pre-release / G4 migrations.
Never `--no-verify`. Each WP ends with a dossier under `tools/verifications/wp-*.md` —
**no dossier, no merge.** Dossier-name collision → append a dated section or use an `-eN` suffix.

Merge: `git merge --no-ff <branch>` + verify (touched package minimum; full `pnpm test` +
`pnpm test:e2e` smoke if `server.ts` changed). Test that changes after a refactor means the
refactor is wrong — revert the extraction, never "fix" the test.

Definition of Done: naming respected, no scope creep into sibling packages, `pnpm build` +
`pnpm typecheck` green, events via `@ninja/events`, dossier filed with re-runnable evidence.
If you detect deviation from the Plan Maestro, Directiva or Quality Manual: stop and surface it.

## Orchestration (multi-worker execution — full protocol in the guide)

Roles (never mix): **Orquestador** (main session: isolates, launches, merges, verifies with its
own commands) · **Obrero** (one fresh session = one frozen prompt = one branch/worktree:
code + tests + dossier + REPORTA) · **Rematador** (fresh session, different model: re-runs
acceptance, micro-fixes, `cierre-etapa-N.md` with verdict CERRADA / CERRADA-CON-RESERVAS /
RECHAZADA) · **Humano** (go/no-go verdicts, §SOLO-HUMANO list).

Rules: orchestrator builds the isolation (worktree + branch), never the worker; never recycle
sessions between tasks; acceptance = commands with expected output, never adjectives; nobody
grades their own work. Frozen prompts are quoted, not edited — stale numbers are fixed via an
orchestrator errata in the launcher. Outage fallback ladder: retry once → other provider
(kiosapi → nvidia → openrouter) → internal subagents (proven in ETAPA 5) → human.

STOP and escalate (never improvise): acceptance failed twice · test changed after refactor ·
out-of-scope file touched · red suite post-merge · unresolvable conflict · provider down with no
healthy lane · anything on the SOLO-HUMANO list (credentials, money, irreversible deletion,
new/public remote, public release, major version of frozen docs, Directiva changes).

## Current Status (snapshot 2026-09-10 — verify against `PLAN_EJECUCION.md` §1, may drift)

ETAPA 6 authorized (sequential T6.1→T6.6, one terminal, merge between each). Baseline:
1174/1174 tests, 96 files, 0 packages without tests. Known debt: `as any` 114 global
(38 in `server.ts`, 1022 lines), prod throws 35, thresholds land in T6.2 (global 50 / critical 70).
E-5 reserves: office-grid 33.82% (React+WS hook needs jsdom — future ADR), dossier errata ui
(documented in `cierre-etapa-5.md`).

## Local Notes

- CORS in `server.ts` is an explicit allowlist — never wildcard.
- `.env` loads by walking up from CWD (`apps/kage-runtime/src/index.ts`). Required:
  `LLM_BASE_URL`, `LLM_DEFAULT_MODEL`, `LLM_API_KEY`.
- `workspaces/` is created at runtime (repo root or per-workspace, see `@ninja/workbench`).
  Gitignored, regenerable.
- **Shell here is PowerShell 5.1**, not bash: `$pid` is reserved; no `head/tail/grep`
  (use `Select-Object -First`); `/dev/null` → `2>$null`; `&&` → `; if ($?) { }`.
  Forward slashes work in git paths; git `**` pathspecs with absolute paths fail — derive
  lists from full `git ls-files` instead. Change dirs via tool `workdir`, not `cd` chains.
- Prettier: single quotes, semicolons, width 100, ES5 trailing commas.
- Private commercial codebase. No public GH pushes without explicit approval.
  (`fix/epic-b-foundations` is fully merged — 0 ahead — and safe to delete.)
