import { describe, it, expect, vi } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker.js';

describe('CircuitBreaker (WP-C2)', () => {
  it('CLOSED → ejecuta normalmente', async () => {
    const breaker = new CircuitBreaker('test', {});
    const result = await breaker.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });

  it('5 failures consecutivos → transición a OPEN', async () => {
    const breaker = new CircuitBreaker('test', { failureThreshold: 3 });
    const fn = () => Promise.reject(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
    }

    expect(breaker.getState()).toBe('OPEN');
  });

  it('OPEN → rechaza con CircuitOpenError sin invocar fn', async () => {
    const breaker = new CircuitBreaker('test', { failureThreshold: 1, resetTimeoutMs: 30000 });
    await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    expect(breaker.getState()).toBe('OPEN');

    const spy = vi.fn(() => Promise.resolve('never-called'));
    await expect(breaker.execute(spy)).rejects.toThrow(CircuitOpenError);
    expect(spy).not.toHaveBeenCalled();
  });

  it('OPEN → HALF_OPEN tras resetTimeoutMs', async () => {
    const breaker = new CircuitBreaker('test', { failureThreshold: 1, resetTimeoutMs: 1 });
    await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    expect(breaker.getState()).toBe('OPEN');

    await new Promise((r) => setTimeout(r, 5));

    const fn = vi.fn().mockResolvedValue('recovered');
    const result = await breaker.execute(fn);
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalled();
  });

  it('HALF_OPEN + 2 successes → CLOSED', async () => {
    const breaker = new CircuitBreaker('test', { failureThreshold: 1, resetTimeoutMs: 1, successThreshold: 2 });

    await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    expect(breaker.getState()).toBe('OPEN');

    await new Promise((r) => setTimeout(r, 5));

    await breaker.execute(() => Promise.resolve('ok1'));
    expect(breaker.getState()).toBe('HALF_OPEN');

    await breaker.execute(() => Promise.resolve('ok2'));
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('HALF_OPEN + 1 failure → vuelve a OPEN', async () => {
    const breaker = new CircuitBreaker('test', { failureThreshold: 1, resetTimeoutMs: 1, successThreshold: 2 });

    await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    expect(breaker.getState()).toBe('OPEN');

    await new Promise((r) => setTimeout(r, 5));

    await expect(breaker.execute(() => Promise.reject(new Error('fail-again')))).rejects.toThrow('fail-again');
    expect(breaker.getState()).toBe('OPEN');
  });

  it('onStateChange callback invocado en cada transición', async () => {
    const onStateChange = vi.fn();
    const breaker = new CircuitBreaker('test', { failureThreshold: 1, resetTimeoutMs: 1, successThreshold: 1, onStateChange });

    await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    expect(onStateChange).toHaveBeenCalledWith('CLOSED', 'OPEN');

    await new Promise((r) => setTimeout(r, 5));
    await breaker.execute(() => Promise.resolve('ok'));
    expect(onStateChange).toHaveBeenCalledWith('OPEN', 'HALF_OPEN');
    expect(onStateChange).toHaveBeenCalledWith('HALF_OPEN', 'CLOSED');
  });
});
