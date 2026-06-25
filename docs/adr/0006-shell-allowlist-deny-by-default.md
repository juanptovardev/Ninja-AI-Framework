# ADR-0006 — Shell Allowlist Deny-by-Default

**Status**: Accepted
**Date**: 2026-06-24
**Branch**: fix/epic-b-foundations

## Context

The original `sandbox.ts` used a blocklist (`BLOCKED_COMMANDS`) to prevent dangerous shell commands. This is inherently insecure because:

1. **Blocklists are incomplete by design** — attackers can always find variations not on the list.
2. **Historical bypasses existed**: `python -c "..."`, `node -e "..."`, `curl`, `bash -c`, `sh -c`, `wget`, `powershell -Command` were all allowed.
3. **Any command not explicitly blocked was permitted** — the inverse of the principle of least privilege.

## Decision

Replace the blocklist with an **allowlist** (deny-by-default policy). Only commands in the `ALLOWED` record in `sandbox.ts` may be executed by the shell integration.

### Allowed categories

| Category | Commands |
|----------|---------|
| Version control | `git` (read + safe write ops) |
| Package managers | `npm`, `pnpm`, `yarn`, `bun` |
| Node runtimes | `node` (scripts only, no `-e`/`--eval`), `tsx` |
| FS read-only | `echo`, `ls`, `dir`, `cat`, `type` |
| FS write (controlled) | `mkdir`, `cp`, `mv`, `copy` |
| Tooling | `tsc`, `turbo`, `vitest`, `playwright`, `prettier`, `eslint`, `rimraf`, `which`, `where` |

### Extension mechanism

Operators can add commands to the allowlist at runtime via the `SHELL_ALLOWLIST_EXTRA` environment variable (comma-separated list of command names). This is intentionally opt-in and must be documented.

### Audit logging

Every denied command emits a `shell.command.denied` event on the `@ninja/events` eventBus with `{ cmd, args, reason }`. This enables runtime observability of what the agent is attempting without allowing it.

## Consequences

**Positive**:
- Historical bypasses (`python -c`, `curl`, `bash -c`, `wget`, `powershell`) are blocked by default.
- New commands require explicit addition — prevents accidental permission escalation.
- Audit trail via `shell.command.denied` events.
- `SHELL_ALLOWLIST_EXTRA` provides a safe escape hatch for dev environments.

**Negative / Risk**:
- Breaking change for dev workflows that used commands like `python`, `bash`, `docker`, `make` directly.
- Mitigation: `SHELL_ALLOWLIST_EXTRA=docker,make` in `.env` for local dev.
- Error message includes instructions on how to extend the allowlist.

## Future

Plan WP-G4 will introduce RBAC. At that point, the allowlist can be extended to be role-aware (e.g., `admin` role can run `docker`, `make`).
