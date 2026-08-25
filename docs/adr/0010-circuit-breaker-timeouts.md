# ADR-0010: Circuit breaker and hierarchical timeouts

## Status

`accepted`

## Context

Kage Runtime depends on local services and OpenAI-compatible providers that can be unavailable or slow. A transient failure must not cascade into repeated requests, leaked timers, or an untyped HTTP 500 response.

`@ninja/common-utils` is a foundation package and cannot depend on `@ninja/contracts`. The circuit breaker therefore owns its local `CircuitOpenError`, while the runtime boundary owns HTTP normalization.

## Decision

- Keep `CircuitBreaker` and `CircuitOpenError` in `@ninja/common-utils` without an internal package dependency.
- Keep `ErrorCodes.CIRCUIT_OPEN` in `@ninja/contracts` as the public error code; do not duplicate the `CircuitOpenError` class there.
- Normalize the common-utils error in Kage Runtime's global Fastify error handler as HTTP 503 with `CIRCUIT_OPEN`.
- Resolve LLM and LightRAG timeouts through `getTimeout()` using the `NINJA_TIMEOUT_<CATEGORY>` environment override.
- Always clear request timers in `finally` blocks.

## Consequences

- External callers receive a stable HTTP error contract while foundations remain acyclic.
- Timeout values are centrally configurable and testable.
- Callers can distinguish temporary circuit-open failures from generic internal errors.
- New integration clients must reuse `getTimeout()` and the shared circuit breaker rather than creating unrelated retry state.

## Compliance

- `pnpm errors:check` verifies the exported error catalog documentation.
- Circuit-breaker, timeout, retry and runtime error-handler tests cover the boundary behavior.
- Code review rejects a dependency from `@ninja/common-utils` to a domain package.
