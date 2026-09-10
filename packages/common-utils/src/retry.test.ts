import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRetryAfterDelayMs, retryWithBackoff } from './retry.js';

describe('retryWithBackoff (WP-D1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('devuelve el primer resultado exitoso sin reintentos', async () => {
    const promise = retryWithBackoff(vi.fn().mockResolvedValue('ok'), {
      maxRetries: 3,
      jitter: false,
    });
    await expect(promise).resolves.toBe('ok');
  });

  it('reintenta y devuelve el valor del intento que éxito', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('try1')).mockResolvedValueOnce('recovered');
    const promise = retryWithBackoff(fn, { maxRetries: 3, jitter: false, baseDelayMs: 100 });
    const resolved = expect(promise).resolves.toBe('recovered');
    await vi.advanceTimersByTimeAsync(100);
    await resolved;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('agota los reintentos y lanza el último error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    const promise = retryWithBackoff(fn, { maxRetries: 2, jitter: false, baseDelayMs: 10 });
    const rejected = expect(promise).rejects.toThrow('boom');
    await vi.advanceTimersByTimeAsync(10 + 10 * 2);
    await rejected;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('aplica backoff exponencial sin jitter (base * factor^n)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('stay'));
    const onRetry = vi.fn();
    const promise = retryWithBackoff(fn, {
      maxRetries: 2,
      baseDelayMs: 100,
      backoffFactor: 2,
      jitter: false,
      onRetry,
    });
    const rejected = expect(promise).rejects.toThrow('stay');
    await vi.advanceTimersByTimeAsync(100);
    expect(onRetry).toHaveBeenNthCalledWith(1, expect.any(Error), 1, 100);
    await vi.advanceTimersByTimeAsync(200);
    expect(onRetry).toHaveBeenNthCalledWith(2, expect.any(Error), 2, 200);
    await vi.advanceTimersByTimeAsync(400);
    await rejected;
  });

  it('acota el retraso a maxDelayMs', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('slow'));
    const onRetry = vi.fn();
    const promise = retryWithBackoff(fn, {
      maxRetries: 1,
      baseDelayMs: 1000,
      maxDelayMs: 50,
      jitter: false,
      onRetry,
    });
    const rejected = expect(promise).rejects.toThrow('slow');
    await vi.advanceTimersByTimeAsync(50);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 50);
    await rejected;
  });

  it('aplica jitter full entre 50% y 100% del retraso exponencial', async () => {
    const randomSpy = vi.spyOn(Math, 'random');
    const fn = vi.fn().mockRejectedValue(new Error('jitter'));
    const onRetry = vi.fn();
    randomSpy.mockReturnValue(0);
    const pMin = retryWithBackoff(fn, { maxRetries: 1, jitter: true, baseDelayMs: 100, onRetry });
    const minRejects = expect(pMin).rejects.toThrow('jitter');
    await vi.advanceTimersByTimeAsync(50);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 50);
    await minRejects;

    randomSpy.mockReturnValue(1);
    const onRetryMax = vi.fn();
    const pMax = retryWithBackoff(fn, {
      maxRetries: 1,
      jitter: true,
      baseDelayMs: 100,
      onRetry: onRetryMax,
    });
    const maxRejects = expect(pMax).rejects.toThrow('jitter');
    await vi.advanceTimersByTimeAsync(100);
    expect(onRetryMax).toHaveBeenCalledWith(expect.any(Error), 1, 100);
    await maxRejects;
  });

  it('retryOn false frena el reintento con un solo intento', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fatal'));
    const onRetry = vi.fn();
    const promise = retryWithBackoff(fn, {
      maxRetries: 3,
      jitter: false,
      retryOn: () => false,
      onRetry,
    });
    await expect(promise).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('respeta retryAfter numérico (segundos) cuando respectRetryAfter está activo', async () => {
    const fn = vi.fn();
    const tooBusy = new Error('429 Too Many Requests') as Error & { retryAfter: number };
    tooBusy.retryAfter = 3;
    fn.mockRejectedValueOnce(tooBusy).mockResolvedValueOnce('ok');
    const onRetry = vi.fn();
    const promise = retryWithBackoff(fn, {
      maxRetries: 2,
      jitter: false,
      baseDelayMs: 10,
      respectRetryAfter: true,
      onRetry,
    });
    await vi.advanceTimersByTimeAsync(2999);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toBe('ok');
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 3000);
  });

  it('lee retry-after desde error.data (patrón HTTP header)', async () => {
    const fn = vi.fn();
    const throttled = new Error('rate limited') as Error & { data: Record<string, unknown> };
    throttled.data = { 'retry-after': '2' };
    fn.mockRejectedValueOnce(throttled).mockResolvedValueOnce('ok');
    const onRetry = vi.fn();
    const promise = retryWithBackoff(fn, {
      maxRetries: 2,
      jitter: false,
      respectRetryAfter: true,
      onRetry,
    });
    await vi.advanceTimersByTimeAsync(2000);
    await expect(promise).resolves.toBe('ok');
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 2000);
  });

  it('respeta retryAfter como Date', async () => {
    const fn = vi.fn();
    const serverError = new Error('503') as Error & { retryAfter: Date };
    serverError.retryAfter = new Date(Date.now() + 1500);
    fn.mockRejectedValueOnce(serverError).mockResolvedValueOnce('ok');
    const onRetry = vi.fn();
    const promise = retryWithBackoff(fn, {
      maxRetries: 2,
      jitter: false,
      respectRetryAfter: true,
      onRetry,
    });
    await vi.advanceTimersByTimeAsync(1500);
    await expect(promise).resolves.toBe('ok');
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 1500);
  });

  it('ignora retryAfter cuando respectRetryAfter está apagado', async () => {
    const fn = vi.fn();
    const tooBusy = new Error('429') as Error & { retryAfter: number };
    tooBusy.retryAfter = 60;
    fn.mockRejectedValueOnce(tooBusy).mockResolvedValueOnce('ok');
    const onRetry = vi.fn();
    const promise = retryWithBackoff(fn, {
      maxRetries: 1,
      jitter: false,
      baseDelayMs: 100,
      respectRetryAfter: false,
      onRetry,
    });
    await vi.advanceTimersByTimeAsync(100);
    await expect(promise).resolves.toBe('ok');
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 100);
  });

  it('captura errores síncronos lanzados por fn', async () => {
    const fn = vi.fn().mockImplementation(() => {
      throw new Error('sync-boom');
    });
    const promise = retryWithBackoff(fn, { maxRetries: 0, jitter: false });
    await expect(promise).rejects.toThrow('sync-boom');
  });

  it('getRetryAfterDelayMs devuelve null sin retryAfter y parsea cadenas', () => {
    expect(getRetryAfterDelayMs(new Error('plain'))).toBeNull();
    const quoted = new Error('q') as Error & { retryAfter: string };
    quoted.retryAfter = '4';
    expect(getRetryAfterDelayMs(quoted)).toBe(4000);
    const iso = new Error('i') as Error & { retryAfter: string };
    iso.retryAfter = new Date(Date.now() + 5000).toISOString();
    const delay = getRetryAfterDelayMs(iso);
    expect(delay).not.toBeNull();
    expect(delay as number).toBeGreaterThan(4000);
    expect(delay as number).toBeLessThanOrEqual(5000);
  });
});
