# Changelog

## Unreleased — EPIC C (parcial) & P0 fixes

### Resilience (EPIC C)

- **WP-C1**: Global Fastify error handler + not-found handler in Kage Runtime; all error replies routed through `sanitizeError` (no stack traces in production). Refs ADR-0009.
- **WP-C2**: `CircuitBreaker` and hierarchical timeouts in `@ninja/common-utils`, `Retry-After` handling with automatic fallback chain across `integrations-llm`, `integrations-lightrag` and `integrations-http`; fallback events logged to Trace Ledger. Refs ADR-0010.

### Fixed (P0 — audit 2026-08-24)

- **CORS preflight**: `X-Ninja-Key` is now allowed in `Access-Control-Allow-Headers`, reactivating Forge Console browser authentication.
- **Approver identity**: approvals now record the real operator identity derived from the API key (SHA-256 fingerprint) instead of a fixed `api-user` (Directiva Ley 6).

## Unreleased — EPIC B Security Foundations

### BREAKING CHANGES

#### WP-B11 — API Key Authentication (HTTP + WebSocket)

All Kage Runtime endpoints (except `/health` and `/api/status`) now require authentication.

**HTTP**: Include the `X-Ninja-Key` header with every request:
```
X-Ninja-Key: <contents of ~/.ninja/runtime.key>
```

**WebSocket**: Send the auth handshake as the first message after connecting:
```json
{ "action": "auth", "key": "<contents of ~/.ninja/runtime.key>" }
```
Wait for `{ "type": "auth.ok" }` before sending other messages. Connections without a valid handshake within 5 seconds are closed with code 1008.

**Migration**:
1. Clients that call the runtime must read `~/.ninja/runtime.key` and inject the header.
2. For local development without auth, set `NINJA_AUTH_DISABLED=true`.
3. For Forge Console (browser), set `NEXT_PUBLIC_RUNTIME_API_KEY` in your `.env.local`.

**Affected clients**: Dojo CLI, Forge Console (HTTP + WS), Companion extension.

#### WP-B15 — Error Response Contract Change

Error responses from the 5 critical endpoints now follow a standardized format:

```json
// Validation error (400)
{ "error": "Invalid request body", "code": "VALIDATION_ERROR", "issues": [...] }

// Internal error (500, production)
{ "error": "Internal error", "code": "INTERNAL_ERROR" }
```

Clients that were parsing `{ "error": "<stack trace>" }` from 500 responses must be updated.

### New Features

- **WP-B12**: Shell execution is now deny-by-default (allowlist). `python`, `curl`, `bash`, `wget`, `powershell` are blocked. Use `SHELL_ALLOWLIST_EXTRA` to extend the allowlist.
- **WP-B14**: SSRF guard on all HTTP requests via `@ninja/integrations-http`. Requests to private IPs, cloud metadata endpoints, and loopback addresses are blocked with `HTTP_SSRF_BLOCKED (403)`.
- **WP-B15**: Zod validation on `/engine/submit`, `/api/shell/execute`, `/api/vault/write`, `/api/git/commit`, `/api/roster/assign`.
- **WP-B9**: `selectFastest` correctly uses `lastPing ?? Infinity` — models without measured ping are not prioritized as "fast".
- **WP-B10**: `ContextOps` legacy class removed from `@ninja/vault`. Use `VaultCoordinator`.

### Error Codes Added

- `HTTP_SSRF_BLOCKED` (403) — SSRF guard blocked the request
- `AUTH_REQUIRED` (401) — Missing or invalid X-Ninja-Key
