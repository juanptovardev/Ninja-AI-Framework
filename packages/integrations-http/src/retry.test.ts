import { describe, it, expect, vi } from 'vitest';
import { withRetry } from './retry.js';
import { NinjaHttpError, NinjaRetryError } from './errors.js';

describe('withRetry — Retry-After (WP-C2)', () => {
  it('respeta Retry-After de 429 en lugar de backoff exponencial', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new NinjaHttpError('Too Many Requests', 429, { retryAfter: '2' }, 'http://test'))
      .mockResolvedValueOnce('ok');

    const result = await withRetry(fn, { maxRetries: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('jitter proporcional al delay (full jitter)', async () => {
    const originalMathRandom = Math.random;
    Math.random = vi.fn(() => 0.5);

    try {
      const fn = vi.fn()
        .mockRejectedValueOnce(new NinjaHttpError('Service Unavailable', 503, {}, 'http://test'))
        .mockResolvedValueOnce('ok');

      await withRetry(fn, { maxRetries: 1, baseDelay: 1000 });
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      Math.random = originalMathRandom;
    }
  });

  it('4xx no retryable → no retry, throw inmediato', async () => {
    const fn = vi.fn().mockRejectedValue(new NinjaHttpError('Bad Request', 400, {}, 'http://test'));

    await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow(NinjaRetryError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
