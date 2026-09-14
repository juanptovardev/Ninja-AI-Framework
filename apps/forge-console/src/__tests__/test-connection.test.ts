/**
 * Tests del test-connection del forge-console (T7.4 / WP-E4).
 *
 * Patrón del repo: entorno node de vitest sin jsdom (precedente:
 * ws-client.test.ts). Se mockea globalThis.fetch — la UI nunca importa
 * LLMClient de @ninja/integrations-llm (no es browser-safe: node:crypto/fs
 * en su grafo); el testeo de conexión va por fetch contra el endpoint
 * existente del runtime GET /api/model-gateway/status.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { testModelGatewayConnection, BASE_URL } from '../../lib/api';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('testModelGatewayConnection (GET /api/model-gateway/status)', () => {
  it('éxito: alcanzable, con latencia y catálogo de modelos', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ catalogSize: 7 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await testModelGatewayConnection();

    expect(result.reachable).toBe(true);
    expect(result.error).toBeNull();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.modelCount).toBe(7);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/model-gateway/status`,
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('payload sin catalogSize numérico → modelCount 0, sigue alcanzable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ stats: {} })));

    const result = await testModelGatewayConnection();

    expect(result.reachable).toBe(true);
    expect(result.modelCount).toBe(0);
  });

  it('HTTP error → no alcanzable con el status como mensaje', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false, 503)));

    const result = await testModelGatewayConnection();

    expect(result.reachable).toBe(false);
    expect(result.error).toBe('HTTP 503');
  });

  it('fallo de red (runtime caído) → no alcanzable con el mensaje de fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:3141'))
    );

    const result = await testModelGatewayConnection();

    expect(result.reachable).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('timeout: AbortController cancela a los timeoutMs y lo reporta', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
          });
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const pending = testModelGatewayConnection(1500);
    await vi.advanceTimersByTimeAsync(1500);
    const result = await pending;

    expect(result.reachable).toBe(false);
    expect(result.error).toBe('Timeout tras 1500ms');
  });

  it('envía X-Ninja-Key si NEXT_PUBLIC_RUNTIME_API_KEY está definido', async () => {
    process.env.NEXT_PUBLIC_RUNTIME_API_KEY = 'k-test';
    vi.resetModules();
    const { testModelGatewayConnection: freshFn, BASE_URL: freshBase } =
      await import('../../lib/api');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ catalogSize: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await freshFn();

    expect(result.reachable).toBe(true);
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['X-Ninja-Key']).toBe('k-test');
    expect(fetchMock.mock.calls[0][0]).toBe(`${freshBase}/api/model-gateway/status`);
    delete process.env.NEXT_PUBLIC_RUNTIME_API_KEY;
  });
});
