/**
 * @ninja/integrations-llm — classify-error.ts
 * Maps LLM errors to FallbackReason for FallbackChain decisions.
 * ADR: docs/adr/0003-llm-fallback-semantics.md
 */
import { isNinjaError, ErrorCodes } from '@ninja/contracts';

/** Mirrors model-gateway FallbackReason to avoid circular dependency. */
type FallbackReason =
  | 'rate_limit'
  | 'server_error'
  | 'quota_exceeded'
  | 'timeout'
  | 'model_unavailable';

/**
 * Classify an unknown error into a FallbackReason for retry decisions.
 * Returns null for non-retryable errors (auth, generic, already-exhausted).
 */
export function classifyLLMError(e: unknown): FallbackReason | null {
  if (isNinjaError(e)) {
    switch (e.code) {
      case ErrorCodes.LLM_TIMEOUT:
        return 'timeout';
      case ErrorCodes.LLM_RATE_LIMITED:
        return 'rate_limit';
      case ErrorCodes.LLM_SERVER:
        return 'server_error';
      // LLM_AUTH, LLM_CALL_FAILED, LLM_ALL_PROVIDERS_FAILED → no fallback
      default:
        return null;
    }
  }
  if (e instanceof Error && e.name === 'AbortError') return 'timeout';
  return null;
}
