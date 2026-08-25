# ADR-0009: Centralized error handling contract

## Status

`accepted`

## Context

The runtime had ~28 `try/catch` blocks in `server.ts` alone, each duplicating `reply.status(500).send(sanitizeError(err, env))`.
This made error responses inconsistent: some returned 500 with sanitized errors, others returned raw objects,
and Fastify validation errors (ZodError, schema-level) had no unified handler. Empty catch blocks silently swallowed errors.

EPIC B established NinjaError hierarchy (ADR-0001) and sanitization (ADR-0007), but there was no centralized
error handler that leveraged both for every request.

## Decision

- Install `setErrorHandler` on Fastify via `registerErrorHandlers(server, env)` in a new `error-handler.ts` file.
- Error hierarchy (top-to-bottom in handler):
  1. `ZodError` → HTTP 400 with `VALIDATION_ERROR` code + Zod issues array
  2. `NinjaError` → use `err.httpStatus` (or 500 as default) + `sanitizeError(err, env)`
  3. Fastify `err.validation` → HTTP 400 with `VALIDATION_ERROR` code + validation issues
  4. Generic `Error` → HTTP 500 with `sanitizeError(err, env)` + structured log
- Install `setNotFoundHandler` → HTTP 404 with `NOT_FOUND` code + `path` field
- Wire the handler after auth hooks and before all route registrations
- Remove redundant `try/catch` blocks in route handlers that only called `sanitizeError` on failure
- Keep `try/catch` when the catch block has specific logic (fallback values, context logging, multi-step pipelines)

## Consequences

- `try/catch` count in `server.ts` reduced from ~28 to 14 (≤15 target)
- Error responses are now uniform: `{ error, code, issues?, details? }` across all routes
- Empty catch blocks are no longer silent — WS message parse failures now log at debug level
- Zod validation errors (previously returned inline in many routes) are now caught centrally
- Fastify schema-level validation errors also pass through the handler
- Route handlers become cleaner: no need to wrap every `await` call in try/catch

## Alternatives considered

- **Midway error handler (plugin)**: more modular but introduces another plugin registration vs a simple function call.
  Since `error-handler.ts` has no lifecycle dependencies (no DB, no bus), a function is simpler than a Fastify plugin.
- **Per-route error handlers**: would defeat the purpose — the goal was centralization and consistency.
- **Decorator pattern**: TypeScript decorators add complexity and are less explicit.
