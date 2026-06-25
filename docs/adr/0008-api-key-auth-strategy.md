# ADR-0008 — API Key Auth Strategy (HTTP + WS)

**Status**: Accepted
**Date**: 2026-06-25
**Branch**: fix/epic-b-foundations

## Context

The Kage Runtime HTTP and WebSocket endpoints were completely unauthenticated. Any process with network access to localhost:3141 could invoke the engine, execute shell commands, or write to the vault. This is the primary risk R2 identified in the security review.

## Decision

Implement a **local API key** authentication system for the Kage Runtime:

### Key Generation and Storage

- Key is generated once via `crypto.randomBytes(32).toString('hex')` on first runtime boot.
- Stored at `~/.ninja/runtime.key` with permissions `0o600` (owner-read-only on Unix).
- On Windows, the file is created without chmod (ACLs are managed by Windows).
- Key persists across restarts — no rotation unless user deletes the file.

### HTTP Authentication

- A Fastify `onRequest` hook checks the `X-Ninja-Key` header on every request.
- Public paths (exempt from auth): `/health`, `/api/status`, `/status`.
- WS upgrade paths (`/ws/`) are also exempt from the HTTP hook (WS handles its own auth).
- Missing or invalid key → `401 AUTH_REQUIRED`.

### WebSocket Authentication

- WS connections start unauthenticated.
- First message must be `{ action: 'auth', key: '<runtimeKey>' }` within 5 seconds.
- On success: server replies `{ type: 'auth.ok' }` and subscribes the connection to events.
- On failure or timeout: connection closed with code `1008`.

### Client Updates

| Client | Mechanism |
|--------|---------|
| Dojo CLI | Reads `~/.ninja/runtime.key` at runtime; injects `X-Ninja-Key` header |
| Forge Console (HTTP) | Reads `NEXT_PUBLIC_RUNTIME_API_KEY` env var; injects header |
| Forge Console (WS) | Sends `{ action: 'auth', key }` on WebSocket open |
| Companion extension | Same pattern (port 3141 + auth) — pending WP-E4 |

### Emergency Escape Hatch

`NINJA_AUTH_DISABLED=true` disables authentication entirely. Not recommended for production. Useful for:
- Local development without setting up the key
- Integration tests (set via `vi.stubEnv`)

## Consequences

**Positive**:
- All endpoints (except /health and /api/status) require auth.
- Key file is local-only — no network exposure.
- WS handshake prevents event snooping without auth.

**Negative / Risk (R2 mitigation)**:
- **Breaking**: existing clients (CLI, Console, Companion) must include the key.
- Mitigated: all clients updated in this PR.
- Mitigation: CHANGELOG entry with migration instructions.
- Error 401 message includes path to `~/.ninja/runtime.key`.

## Future

WP-G4 will add RBAC + JWT tokens for role-based access. This API key serves as the bootstrap auth layer until then. The key file path and escape hatch will be maintained for compatibility.
