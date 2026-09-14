import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMClient } from './client';
import { eventBus } from '@ninja/events';

describe('LLMClient Retry Logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should retry up to 3 times on 429 error and use exponential backoff', async () => {
    const delayFn = vi.fn().mockResolvedValue(undefined);
    const client = new LLMClient('openai', 'http://localhost', 'key', { delayFn });

    let fetchAttempts = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      fetchAttempts++;
      return {
        ok: false,
        status: 429,
        text: async () => '{"error": {"message": "Rate limit"}}',
      } as unknown as Response;
    });

    const emitSpy = vi.spyOn(eventBus, 'emit');

    await expect(client.complete({ model: 'gpt-4', messages: [] })).rejects.toThrow('Rate limit');

    expect(fetchAttempts).toBe(4); // 1 initial + 3 retries
    expect(delayFn).toHaveBeenCalledTimes(3);
    expect(delayFn).toHaveBeenNthCalledWith(1, 1000);
    expect(delayFn).toHaveBeenNthCalledWith(2, 2000);
    expect(delayFn).toHaveBeenNthCalledWith(3, 4000);

    // Should emit llm.rate_limited
    const rateLimitEvent = emitSpy.mock.calls.find((call) => call[0].type === 'llm.rate_limited');
    expect(rateLimitEvent).toBeDefined();
  });

  it('should retry on 500 error but not emit llm.rate_limited', async () => {
    const delayFn = vi.fn().mockResolvedValue(undefined);
    const client = new LLMClient('anthropic', 'http://localhost', 'key', { delayFn });

    let fetchAttempts = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      fetchAttempts++;
      return {
        ok: false,
        status: 500,
        text: async () => '{"error": {"message": "Server error"}}',
      } as unknown as Response;
    });

    const emitSpy = vi.spyOn(eventBus, 'emit');

    await expect(client.complete({ model: 'claude', messages: [] })).rejects.toThrow(
      'Server error'
    );

    expect(fetchAttempts).toBe(4);
    expect(delayFn).toHaveBeenCalledTimes(3);

    const rateLimitEvent = emitSpy.mock.calls.find((call) => call[0].type === 'llm.rate_limited');
    expect(rateLimitEvent).toBeUndefined();
  });

  it('should succeed if a retry works', async () => {
    const delayFn = vi.fn().mockResolvedValue(undefined);
    const client = new LLMClient('openai', 'http://localhost', 'key', { delayFn });
    let fetchAttempts = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      fetchAttempts++;
      if (fetchAttempts < 3) {
        return {
          ok: false,
          status: 429,
          text: async () => '{"error": {"message": "Rate limit"}}',
        } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({ id: '123' }),
      } as unknown as Response;
    });

    const res = await client.complete({ model: 'gpt-4', messages: [] });
    expect(res).toEqual({ id: '123' });
    expect(fetchAttempts).toBe(3);
    expect(delayFn).toHaveBeenCalledTimes(2);
  });
});

describe('LLMClient ping (test-connection, T7.4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('éxito: GET /models devuelve latencyMs y los IDs de modelo', async () => {
    const client = new LLMClient('openai', 'http://localhost:9999', 'sk-test');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'model-a' }, { id: 'model-b' }] }),
    } as unknown as Response);

    const result = await client.ping();

    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.models).toEqual(['model-a', 'model-b']);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:9999/models',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('usa AbortSignal.timeout con 5000ms por defecto', async () => {
    const client = new LLMClient('openai', 'http://localhost:9999', 'sk-test');
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    } as unknown as Response);

    await client.ping();
    expect(timeoutSpy).toHaveBeenCalledWith(5000);

    await client.ping({ timeoutMs: 1234 });
    expect(timeoutSpy).toHaveBeenCalledWith(1234);
  });

  it('respuesta sin data válida → models = []', async () => {
    const client = new LLMClient('ollama', 'http://localhost:9999', 'sk-test');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as unknown as Response);

    const result = await client.ping();
    expect(result.models).toEqual([]);
  });

  it('timeout de red (TimeoutError) → LLMError retryable 504', async () => {
    const client = new LLMClient('openai', 'http://localhost:9999', 'sk-test');

    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('This operation was aborted'), { name: 'TimeoutError' })
      );

    await expect(client.ping()).rejects.toMatchObject({
      retryable: true,
      httpStatus: 504,
    });
  });

  it('HTTP 401 → LLMError auth', async () => {
    const client = new LLMClient('openai', 'http://localhost:9999', 'bad-key');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"error": {"message": "Invalid API key"}}',
    } as unknown as Response);

    await expect(client.ping()).rejects.toThrow('Invalid API key');
  });
});
