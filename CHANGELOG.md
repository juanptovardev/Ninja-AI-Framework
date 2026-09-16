# Changelog

## v1.0.0 — 2026-09-15 · Enterprise-ready baseline

Primer release comercial del Ninja AI Framework: plataforma local-first de orquestación
multi-agente para Windows con runtime único (`kage-runtime` :3141), dashboard web
(Forge Console :3001) y CLI (Dojo). Distribución vía instalador Windows; nunca npm.

### Added
- **Sistema de agentes (11 definitions)** ejecutando sobre runtime único; delegación vía Delegation Router.
- **Memoria 4 capas (Vault)**: HOT (in-memory) / WARM (Engram, compresión 5:1) / COLD (LightRAG, 20:1) / FROZEN (Trace Ledger anchors).
- **Kage Engine**: intake → interview → plan → coordinador con approvals dobles (Sentinel, Ley 6).
- **Flow Matrix**: ejecución de workflows con paralelismo real (waves Kahn + pool acotado), watchdog de deadlock (`FLOW_DEADLOCK_TIMEOUT`) y snapshot persistente en Trace Ledger (T6.6).
- **Resiliencia**: health granular (`/health` liveness + `/health/ready` readiness), WS reconnect con backoff+jitter, shutdown ordenado en 5 pasos, rate limiting + helmet (ADR-0012), logs JSON estructurados con correlation IDs.
- **Calidad**: 1336 tests unitarios (110 archivos) + 16 E2E, thresholds de cobertura (global 50 / críticos 70), 0 paquetes sin tests, message-queues de errores catalogados (47 códigos).
- **Producto**: onboarding wizard 4 pasos, ContentPackLoader (8 ítems de content/ en Arsenal), widgets con datos vivos, banner de modo degradado, Test Connection real, i18n es/en y EULA de primera ejecución.
- **Distribución**: pipeline de instalador Windows portable (`scripts/build-installer.mjs`) con verificación post-instalación `/health` (ADR-0014).

### Changed
- `server.ts` 1022 → **394 líneas** (composition root; 15 módulos de rutas por dominio).
- `as any` global: 114 → **0** (incluidos `.tsx`).
- Errores tipados `NinjaError` con catálogo en `docs/errors.md` (regenerado por `pnpm errors:docs`).
- Auth browser del cliente: la key local se envía como `X-Ninja-Key` en cada llamada (con EULA seed y seed de locale en E2E).
- Dependencias de seguridad: `next` 16.3.5 (RCE), `fastify` ≥5.12.1, transitivos parchados vía overrides (`pnpm audit --prod` → 0 vulnerabilidades).

### Fixed
- CORS preflight `X-Ninja-Key` + identidad real del approver (P0,auditoría 2026-08-24).
- EV-14/15 (mock data en widgets), EV-20 (0 dialogs nativos), EV-23 (settings unificados), EV-25 (console.warn → logger), EV-27 (agentId real en Learning Loop).
- FK huérfana engram en SQLite `:memory:`; workspace typecheck + parseo de `.tsx` en vitest (oxc).

### Security
- Auth `X-Ninja-Key` (HTTP+WS, ADR-0008); sanitización de errores (§4.3) y secret-scan en Gate 3.
- `pnpm audit --prod` limpio en el tag (`b932a30`: next 16.3.5, fastify 5.12.4, overrides).

### Known residual debt (documentada)
- EXC-3: office-grid 33.82% cobertura (hook requiere jsdom — decisión diferida, ADR futura).
- ADR-0013 / DEBT(T6.4): 15 archivos con violaciones de capa pre-existentes, grandfathered.
- kage-engine y vault <70% cobertura (el gate los denuncia; deuda activa).
- Companion extension: de-scope a F5+ (ADR-0011).
- Instalador: Node del sistema (≥22 <25) requerido; servidor Next standalone pendiente (T8.1 F5.x).

Registro completo por fase: `tools/enterprise-progress.md`, dossiers `tools/verifications/*.md`.

---

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
