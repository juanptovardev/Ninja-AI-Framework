# Error Codes Reference
> **Auto-generated** from `packages/contracts/src/errors.ts`. Do not edit manually.
> Run `pnpm errors:docs` to regenerate.

## Full Catalog

| Code | Domain | HTTP Status | Retryable | Description |
|------|--------|-------------|-----------|-------------|
| `LLM_TIMEOUT` | `llm` | 504 | ✅ | @ninja/contracts — errors.ts
Jerarquía de errores tipados para el Ninja AI Framework.
ADR: docs/adr/0001-ninja-error-hierarchy.md
/

// ─────────────────────────────────────────────────────────────────────────────
// Domain
// ─────────────────────────────────────────────────────────────────────────────

export type NinjaErrorDomain =
  | 'llm'
  | 'budget'
  | 'vault'
  | 'sentinel'
  | 'roster'
  | 'gateway'
  | 'shell'
  | 'fs'
  | 'flow'
  | 'engine'
  | 'runtime';

// ─────────────────────────────────────────────────────────────────────────────
// ErrorCode — branded type (M3) to prevent typos at compile time
// ─────────────────────────────────────────────────────────────────────────────

/** @see ErrorCodes for all valid values */
export type ErrorCode = string & { readonly __brand: unique symbol };

/** Catalog of all known error codes. Extend here when adding new WPs. */
export const ErrorCodes = {
  // LLM / integrations-llm
  /** LLM request exceeded the configured timeout (retryable) |
| `LLM_RATE_LIMITED` | `llm` | 429 | ✅ | LLM provider returned 429 Rate Limited (retryable) |
| `LLM_AUTH` | `llm` | 401 | ❌ | LLM provider returned 401 Unauthorized |
| `LLM_SERVER` | `llm` | 502-503 | ✅ | LLM provider returned 5xx Server Error |
| `LLM_CALL_FAILED` | `llm` | 503 | ❌ | Generic LLM call failure |
| `LLM_ALL_PROVIDERS_FAILED` | `llm` | 503 | ✅ | All models in the fallback chain have been exhausted |
| `APPROVAL_DENIED` | `sentinel` | 403 | ❌ | Approval request was denied by policy |
| `APPROVAL_TIMEOUT` | `sentinel` | 504 | ✅ | Approval request timed out waiting for resolution (retryable) |
| `APPROVAL_NOT_FOUND` | `sentinel` | 404 | ❌ | Approval request ID not found |
| `ENGINE_INVALID_INTAKE` | `engine` | 400 | ❌ | Engine received an invalid intake request |
| `ENGINE_PLAN_FAILED` | `engine` | 500 | ✅ | Engine plan generation failed |
| `ENGINE_COORDINATOR_FAILED` | `engine` | 500 | ✅ | Engine coordinator step failed |
| `ROSTER_AGENT_NOT_FOUND` | `roster` | 404 | ❌ | Agent ID not found in the roster |
| `ROSTER_INVALID_DEFINITION` | `roster` | 400 | ❌ | Agent definition is invalid or malformed |

## Usage

```ts
import { LLMError, ErrorCodes, isNinjaError, wrapUnknown } from '@ninja/contracts';

// Throw typed error
throw new LLMError(ErrorCodes.LLM_TIMEOUT, 'Request timed out', {
  retryable: true,
  httpStatus: 504,
  context: { model: 'gpt-4o' },
});

// Narrowing in catch
catch (e) {
  if (isNinjaError(e)) {
    console.log(e.code, e.domain, e.retryable);
  }
}

// Wrap unknown errors
catch (e) {
  throw wrapUnknown(e, ErrorCodes.LLM_CALL_FAILED, 'llm');
}
```
