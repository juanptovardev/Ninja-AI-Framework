# Error Codes Reference
> **Auto-generated** from `packages/contracts/src/errors.ts`. Do not edit manually.
> Run `pnpm errors:docs` to regenerate.

## Full Catalog

| Code | Domain | HTTP Status | Retryable | Description |
|------|--------|-------------|-----------|-------------|
| `LLM_TIMEOUT` | `llm` | 504 | ✅ | @ninja/contracts — errors.tsJerarquía de errores tipados para el Ninja AI Framework.ADR: docs/adr/0001-ninja-error-hierarchy.md/

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
| `LLM_PROVIDER_ALREADY_REGISTERED` | `llm` | 500 | ❌ | Provider already registered in the LLM registry — duplicate registration |
| `LLM_PROVIDER_NOT_REGISTERED` | `llm` | 500 | ❌ | Provider requested from the LLM registry was never registered |
| `ARSENAL_PERMISSION_DENIED` | `runtime` | 403 | ❌ | Tool execution denied by the arsenal permission guard |
| `ARSENAL_TOOL_EXISTS` | `runtime` | 500 | ❌ | A tool with the given ID is already registered |
| `ARSENAL_SKILL_EXISTS` | `runtime` | 500 | ❌ | A skill with the given ID is already registered |
| `FLOW_STATE_LOST` | `flow` | 500 | ❌ | Workflow running state disappeared mid-execution |
| `FLOW_CIRCULAR_DEPENDENCY` | `flow` | 500 | ❌ | Workflow step graph contains a circular dependency |
| `FLOW_DEADLOCK_TIMEOUT` | `flow` | 504 | ✅ | A parallel wave did not settle within deadlockTimeoutMs (circular wait at runtime) |
| `FLOW_INVALID_OPTIONS` | `flow` | 400 | ❌ | WorkflowExecutor received invalid concurrency/deadlock options |
| `INSTALLER_BACKUP_NOT_FOUND` | `runtime` | 404 | ❌ | Backup manifest path does not exist on disk |
| `FS_METADATA_FAILED` | `fs` | 500 | ❌ | stat/metadata read failed for a path |
| `FS_SCAN_FAILED` | `fs` | 500 | ❌ | Directory scan failed |
| `FS_TREE_FAILED` | `fs` | 500 | ❌ | Recursive file-tree build failed |
| `GIT_COMMIT_MESSAGE_REQUIRED` | `runtime` | 500 | ❌ | Commit message is empty |
| `GIT_BRANCH_NAME_REQUIRED` | `runtime` | 500 | ❌ | Branch name is empty |
| `GIT_INVALID_BRANCH_NAME` | `runtime` | 400 | ❌ | Branch name contains forbidden characters (.., ~, ^) |
| `GIT_NOT_ON_BRANCH` | `runtime` | 500 | ❌ | Pull attempted while not on a branch (detached HEAD) |
| `LIGHTRAG_HTTP_ERROR` | `runtime` | 500 | ❌ | LightRAG HTTP returned a non-OK status |
| `APPROVAL_DENIED` | `sentinel` | 403 | ❌ | Approval request was denied by policy |
| `APPROVAL_TIMEOUT` | `sentinel` | 504 | ✅ | Approval request timed out waiting for resolution (retryable) |
| `APPROVAL_NOT_FOUND` | `sentinel` | 404 | ❌ | Approval request ID not found |
| `ENGINE_INVALID_INTAKE` | `engine` | 400 | ❌ | Engine received an invalid intake request |
| `ENGINE_PLAN_FAILED` | `engine` | 500 | ✅ | Engine plan generation failed |
| `ENGINE_COORDINATOR_FAILED` | `engine` | 500 | ✅ | Engine coordinator step failed |
| `ROSTER_AGENT_NOT_FOUND` | `roster` | 404 | ❌ | Agent ID not found in the roster |
| `ROSTER_INVALID_DEFINITION` | `roster` | 400 | ❌ | Agent definition is invalid or malformed |
| `BUDGET_EXCEEDED` | `budget` | 500 | ❌ | Session token budget exceeded — operation blocked |
| `HTTP_SSRF_BLOCKED` | `runtime` | 500 | ❌ | HTTP request blocked by SSRF guard — target resolves to a private/reserved IP |
| `AUTH_REQUIRED` | `runtime` | 401 | ❌ | Missing or invalid X-Ninja-Key header — authentication required |
| `CIRCUIT_OPEN` | `runtime` | 500 | ❌ | Circuit breaker is OPEN — service temporarily unavailable (retryable) |
| `NOT_FOUND` | `runtime` | 404 | ❌ | Requested resource was not found |
| `ADAPTER_UNSUPPORTED_CONNECTION` | `runtime` | 500 | ❌ | Client adapter connection type is not supported by getClientAdapter |
| `ADAPTER_METHOD_NOT_IMPLEMENTED` | `runtime` | 500 | ❌ | Base transport adapter method invoked without an override in the concrete adapter |
| `VAULT_LAYERS_EMPTY` | `vault` | 500 | ❌ | VaultQuery.layers must contain at least one layer — no layers to query |
| `VAULT_UNSUPPORTED_LAYER` | `vault` | 500 | ❌ | A memory layer ID was requested that the vault does not support |
| `VAULT_BUDGET_NOT_POSITIVE` | `vault` | 500 | ❌ | Budget allocation received a non-positive totalBudget |
| `VAULT_LAYERS_REQUIRED` | `vault` | 500 | ❌ | Budget allocation requires at least one layer |
| `VAULT_NO_VALID_LAYERS` | `vault` | 500 | ❌ | Budget allocation found no valid layers for percentage allocation |
| `PULSE_MONITOR_NOT_CONFIGURED` | `runtime` | 500 | ❌ | PulseMonitor not configured — call setDashboardMonitor() before dashboard reads |
| `PULSE_INVALID_FINDING` | `runtime` | 400 | ❌ | Finding data failed Zod validation in openFinding |
| `WORKBENCH_NO_ACTIVE_CONTEXT` | `runtime` | 500 | ❌ | requireActiveContext called before any workspace context was set |

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
