/**
 * @ninja/integrations-llm — classify-error.test.ts
 * TDD tests for classifyLLMError helper (WP-B3)
 */
import { describe, it, expect } from 'vitest';
import { classifyLLMError } from './classify-error.js';
import { LLMError, ErrorCodes } from '@ninja/contracts';

describe('classifyLLMError', () => {
  it('LLMError LLM_TIMEOUT → timeout', () => {
    const e = new LLMError(ErrorCodes.LLM_TIMEOUT, 'timeout', { retryable: true });
    expect(classifyLLMError(e)).toBe('timeout');
  });

  it('LLMError LLM_RATE_LIMITED → rate_limit', () => {
    const e = new LLMError(ErrorCodes.LLM_RATE_LIMITED, 'rate limited');
    expect(classifyLLMError(e)).toBe('rate_limit');
  });

  it('LLMError LLM_SERVER → server_error', () => {
    const e = new LLMError(ErrorCodes.LLM_SERVER, 'server error');
    expect(classifyLLMError(e)).toBe('server_error');
  });

  it('LLMError LLM_AUTH → null (no fallback for auth errors)', () => {
    const e = new LLMError(ErrorCodes.LLM_AUTH, 'invalid api key');
    expect(classifyLLMError(e)).toBeNull();
  });

  it('LLMError LLM_CALL_FAILED → null (generic failure, not retryable by default)', () => {
    const e = new LLMError(ErrorCodes.LLM_CALL_FAILED, 'call failed');
    expect(classifyLLMError(e)).toBeNull();
  });

  it('Error with name AbortError → timeout', () => {
    const e = new Error('aborted');
    e.name = 'AbortError';
    expect(classifyLLMError(e)).toBe('timeout');
  });

  it('generic Error → null', () => {
    expect(classifyLLMError(new Error('unknown'))).toBeNull();
  });

  it('string → null', () => {
    expect(classifyLLMError('error string')).toBeNull();
  });

  it('null → null', () => {
    expect(classifyLLMError(null)).toBeNull();
  });

  it('LLMError LLM_ALL_PROVIDERS_FAILED → null (chain already exhausted)', () => {
    const e = new LLMError(ErrorCodes.LLM_ALL_PROVIDERS_FAILED, 'all failed');
    expect(classifyLLMError(e)).toBeNull();
  });
});
