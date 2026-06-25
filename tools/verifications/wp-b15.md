# WP-B15 · Zod en boundaries + sanitizeError — Dossier de Cierre

**Branch**: `fix/epic-b-foundations`
**Fecha**: 2026-06-24

## Estado

✅ **Cerrado**. 5 endpoints con Zod + sanitizeError. 8 tests verdes.

## Archivos creados / modificados

| Acción | Archivo |
|--------|---------|
| Creado | `apps/kage-runtime/src/sanitize-error.ts` |
| Creado | `apps/kage-runtime/src/route-schemas.ts` |
| Modificado | `apps/kage-runtime/src/server.ts` — 5 endpoints + imports |
| Creado | `apps/kage-runtime/src/__tests__/sanitize-error.test.ts` |
| Creado | `docs/adr/0007-error-sanitization-zod-boundaries.md` |

## Endpoints con Zod aplicado

| Endpoint | Schema | Antes | Después |
|---------|--------|-------|---------|
| `POST /api/roster/assign` | `RosterAssignSchema` | `as { clientId: string; role: string }` | Zod parse + sanitizeError |
| `POST /engine/submit` | `EngineSubmitSchema` | `request.body as any` | Zod parse + sanitizeError |
| `POST /api/shell/execute` | `ShellExecuteSchema` | `as { cmd, args, cwd }` | Zod parse + sanitizeError |
| `POST /api/vault/write` | `VaultWriteSchema` | custom interface + manual check | Zod parse + sanitizeError |
| `POST /api/git/commit` | `GitCommitSchema` | `as { repoPath?, message }` | Zod parse + sanitizeError |

## Matriz sanitizeError

| Input | Env | Error response |
|-------|-----|---------------|
| NinjaError | production | `{ error: msg, code }` — sin details |
| NinjaError | development | `{ error: msg, code, details: context }` |
| Error genérico | production | `{ error: 'Internal error', code: 'INTERNAL_ERROR' }` |
| Error genérico | development | `{ error: msg, code: 'INTERNAL_ERROR' }` — sin stack |
| String/unknown | production | `{ error: 'Internal error', code: 'INTERNAL_ERROR' }` |
| String/unknown | development | `{ error: String(err), code: 'INTERNAL_ERROR' }` |

## Métricas

| Métrica | Baseline | Después |
|---------|----------|---------|
| `as any` en server.ts | ~85 | 37 (reducción de 48) |
| Endpoints con Zod | 0 | 5 |
| `sanitizeError` aplicado | 0 | 5 endpoints |
| Tests sanitize-error | — | 8 ✅ |
| Stack filtrado en prod | ❌ | ✅ nunca expuesto |
| Typecheck `@ninja/kage-runtime` | ✅ | ✅ |

## Verificación

```bash
pnpm vitest run apps/kage-runtime/src/__tests__/sanitize-error.test.ts
# → 8 passed

pnpm --filter @ninja/kage-runtime typecheck
# → ✅

grep -c "as any" apps/kage-runtime/src/server.ts
# → 37 (reducción de ≥40 vs baseline ~85)
```
