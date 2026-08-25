# ADR-0007 — Error Sanitization Contract + Zod Boundaries

**Status**: Accepted
**Date**: 2026-06-24
**Branch**: fix/epic-b-foundations

## Context

Prior to WP-B15, the Kage Runtime had two security problems at HTTP boundaries:

1. **Information leakage in error responses**: ~23 error handlers returned `{ error: err.message }` directly. In production, this can leak stack traces, file paths, internal variable names, SQL schemas, or other implementation details to clients.

2. **Missing input validation**: Route handlers used `request.body as any` to cast request bodies without validation. This allowed injection of unexpected types, oversized payloads, and invalid enum values into business logic.

## Decisions

### Decision 1: `sanitizeError` — Standardized error responses

A single `sanitizeError(err, env)` function in `apps/kage-runtime/src/sanitize-error.ts`:

- **`NinjaError`**: returns `{ error: message, code, details? }`. Details (non-PII context) included only in non-production.
- **Generic `Error` in production**: returns `{ error: 'Internal error', code: 'INTERNAL_ERROR' }` — message hidden.
- **Generic `Error` in dev/test**: returns `{ error: message, code: 'INTERNAL_ERROR' }` — message shown but no stack.
- **Unknown type**: `String(err)` in dev, generic in prod.

Stack traces are **never** included in the response. This is non-negotiable.

### Decision 2: Zod schemas at route boundaries

A centralized `apps/kage-runtime/src/route-schemas.ts` defines Zod schemas for all mutating endpoints. Validation happens before any business logic runs:

```ts
const parsed = Schema.safeParse(request.body);
if (!parsed.success) {
  return reply.status(400).send({
    error: 'Invalid request body',
    code: 'VALIDATION_ERROR',
    issues: parsed.error.issues,
  });
}
const body = parsed.data; // typed and validated
```

### Endpoints covered (Phase 1)

| Endpoint | Schema |
|---------|--------|
| `POST /api/roster/assign` | `RosterAssignSchema` |
| `POST /engine/submit` | `EngineSubmitSchema` |
| `POST /api/shell/execute` | `ShellExecuteSchema` |
| `POST /api/vault/write` | `VaultWriteSchema` |
| `POST /api/git/commit` | `GitCommitSchema` |

## Error Response Contract

```ts
// 400 — Validation error
{ error: 'Invalid request body', code: 'VALIDATION_ERROR', issues: ZodIssue[] }

// 500 — Internal error (production)
{ error: 'Internal error', code: 'INTERNAL_ERROR' }

// 500 — Internal error (development)
{ error: '<original message>', code: 'INTERNAL_ERROR' }

// 500 — NinjaError (any env)
{ error: '<ninja message>', code: '<ninja code>', details?: <context> }
```

## Consequences

**Positive**:
- Information leakage eliminated for the 5 critical endpoints.
- Typed request bodies eliminate entire class of type-casting bugs.
- Consistent error format enables frontend error handling patterns.
- Stack traces never exposed in production.

**Negative / Risk**:
- Breaking change for clients that parsed `{ error: stackTrace }` responses. Documented in CHANGELOG.
- `RosterAssignSchema` uses a closed `role` enum — must be updated if new roles are added.
- WP-C1 will generalize the error handler globally; B15 covers critical endpoints now.
