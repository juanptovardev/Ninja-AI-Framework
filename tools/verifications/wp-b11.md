# WP-B11 · API Key auth HTTP + WS — Dossier de Cierre

**Branch**: `fix/epic-b-foundations`
**Fecha**: 2026-06-25

## Estado

✅ **Cerrado**. Auth implementada, clientes actualizados. 5 tests HTTP verdes.

## Archivos creados / modificados

| Acción | Archivo |
|--------|---------|
| Creado | `apps/kage-runtime/src/auth-key.ts` |
| Creado | `apps/kage-runtime/src/__tests__/auth.test.ts` |
| Modificado | `apps/kage-runtime/src/server.ts` — onRequest hook + WS handshake |
| Modificado | `apps/dojo-cli/src/runtime-client.ts` — X-Ninja-Key header |
| Modificado | `apps/forge-console/lib/api.ts` — X-Ninja-Key via env var |
| Modificado | `apps/forge-console/lib/ws-client.ts` — auth handshake on connect |
| Modificado | `packages/contracts/src/errors.ts` — AUTH_REQUIRED + AuthError |
| Creado | `docs/adr/0008-api-key-auth-strategy.md` |
| Creado | `CHANGELOG.md` |

## Arquitectura

```
~/.ninja/runtime.key  ←  64 hex chars (randomBytes(32))
         │
         ├─ Dojo CLI: reads file → X-Ninja-Key header
         ├─ Forge Console: NEXT_PUBLIC_RUNTIME_API_KEY env → header
         └─ Forge Console WS: sends { action:'auth', key } on open
```

## Rutas públicas (sin auth)

- `GET /health`
- `GET /api/status`
- `GET /status`

## Tests

| Test | Estado |
|------|--------|
| /health sin key → 200 | ✅ |
| /api/status sin key → 200 | ✅ |
| ruta protegida sin key → 401 AUTH_REQUIRED | ✅ |
| ruta protegida con key inválida → 401 | ✅ |
| ruta protegida con key válida → 200 | ✅ |

## Métricas

| Métrica | Valor |
|---------|-------|
| Tests auth | 5 ✅ |
| Typecheck `@ninja/kage-runtime` | ✅ |
| Typecheck `dojo-cli` | ✅ |
| AUTH_REQUIRED error code | ✅ |
| AuthError class | ✅ |
| CHANGELOG entry | ✅ |
| ADR-0008 | ✅ |
| `NINJA_AUTH_DISABLED` escape hatch | ✅ |

## WS Handshake Protocol

```
Client → Server: { action: 'auth', key: '<runtime-key>' }
Server → Client: { type: 'auth.ok' }
[5s timeout si no llega el handshake → close(1008)]
```
