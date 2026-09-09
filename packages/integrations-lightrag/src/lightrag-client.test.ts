import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eventBus } from '@ninja/events';
import { isNinjaError, NinjaError } from '@ninja/contracts';
import { LightRAGClient } from './lightrag-client.js';
import type { LightRAGDocument } from './schema.js';

const doc: LightRAGDocument = { id: 'doc-1', content: 'contenido de prueba', metadata: { a: 1 } };
const queryResults = [
  { documentId: 'doc-1', chunk: 'pedazo 1', score: 0.9 },
  { documentId: 'doc-2', chunk: 'pedazo 2', score: 0.8 },
];

function okResponse(body?: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  } as unknown as Response;
}

function errResponse(status: number, statusText: string): Response {
  return { ok: false, status, statusText } as unknown as Response;
}

function abortError(): Error {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

async function catchTyped<T>(promise: Promise<T>): Promise<NinjaError> {
  try {
    await promise;
    throw new Error('La promesa debería haber rechazado con NinjaError');
  } catch (error) {
    expect(isNinjaError(error)).toBe(true);
    return error as NinjaError;
  }
}

describe('LightRAGClient (fetch mockeado)', () => {
  const originalFetch = globalThis.fetch;
  let client: LightRAGClient;
  let fetchMock: ReturnType<typeof vi.fn>;
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    client = new LightRAGClient('http://localhost:9621');
    emitSpy = vi.spyOn(eventBus, 'emit').mockImplementation(() => true);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function eventsOf(type: string): Array<{ payload: Record<string, unknown> }> {
    return emitSpy.mock.calls
      .map((c: unknown[]) => c[0] as { type: string; payload: Record<string, unknown> })
      .filter((e: { type: string }) => e.type === type);
  }

  // ── index ───────────────────────────────────────────────────────────────

  describe('index', () => {
    it('hace POST /index con el documento serializado y emite eventos', async () => {
      fetchMock.mockResolvedValueOnce(okResponse());

      await client.index(doc);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:9621/index');
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify(doc));

      const types = emitSpy.mock.calls.map((c: unknown[]) => (c[0] as { type: string }).type);
      expect(types).toContain('lightrag.index.started');
      expect(types).toContain('lightrag.index.completed');
    });

    it('HTTP 500 → NinjaError LIGHTRAG_SERVER retryable, nunca throw crudo', async () => {
      fetchMock.mockResolvedValue(errResponse(500, 'Internal Server Error'));

      const error = await catchTyped(client.index(doc));

      expect(error.code).toBe('LIGHTRAG_SERVER');
      expect(error.retryable).toBe(true);
      expect(error.message).toContain('index');
      expect(client.isAvailable).toBe(false);
    });

    it('HTTP 429 → NinjaError LIGHTRAG_RATE_LIMITED retryable', async () => {
      fetchMock.mockResolvedValue(errResponse(429, 'Too Many Requests'));

      const error = await catchTyped(client.index(doc));

      expect(error.code).toBe('LIGHTRAG_RATE_LIMITED');
      expect(error.retryable).toBe(true);
    });

    it('HTTP 401 → NinjaError LIGHTRAG_AUTH no retryable', async () => {
      fetchMock.mockResolvedValue(errResponse(401, 'Unauthorized'));

      const error = await catchTyped(client.index(doc));

      expect(error.code).toBe('LIGHTRAG_AUTH');
      expect(error.retryable).toBe(false);
    });

    it('HTTP 404 → NinjaError LIGHTRAG_NOT_FOUND', async () => {
      fetchMock.mockResolvedValue(errResponse(404, 'Not Found'));

      const error = await catchTyped(client.index(doc));

      expect(error.code).toBe('LIGHTRAG_NOT_FOUND');
    });

    it('HTTP 400 → NinjaError LIGHTRAG_BAD_REQUEST', async () => {
      fetchMock.mockResolvedValue(errResponse(400, 'Bad Request'));

      const error = await catchTyped(client.index(doc));

      expect(error.code).toBe('LIGHTRAG_BAD_REQUEST');
    });

    it('timeout (AbortError) → NinjaError LIGHTRAG_TIMEOUT con ms del timeout', async () => {
      fetchMock.mockRejectedValueOnce(abortError());

      const error = await catchTyped(client.index(doc));

      expect(error.code).toBe('LIGHTRAG_TIMEOUT');
      expect(error.retryable).toBe(true);
      expect(error.message).toContain('timed out after 10000ms');
    });

    it('fallo de red (fetch rechaza) → NinjaError LIGHTRAG_NETWORK_ERROR', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

      const error = await catchTyped(client.index(doc));

      expect(error.code).toBe('LIGHTRAG_NETWORK_ERROR');
      expect(error.retryable).toBe(false);
      expect(error.message).toContain('fetch failed');
    });

    it('emite lightrag.service.unavailable cuando index falla', async () => {
      fetchMock.mockResolvedValue(errResponse(500, 'Internal Server Error'));

      await catchTyped(client.index(doc));

      const events = eventsOf('lightrag.service.unavailable');
      expect(events).toHaveLength(1);
      expect(events[0]?.payload).toMatchObject({ operation: 'index' });
    });

    it('omite el request cuando el servicio está marcado no disponible', async () => {
      fetchMock.mockResolvedValue(errResponse(503, 'Service Unavailable'));
      await expect(client.health()).resolves.toBe(false);
      expect(client.isAvailable).toBe(false);

      await client.index(doc);

      expect(fetchMock).toHaveBeenCalledOnce(); // solo el /health
      expect(eventsOf('lightrag.index.started')).toHaveLength(1);
      expect(eventsOf('lightrag.index.completed')).toHaveLength(0);
    });

    it('respeta el timeout configurado con setTimeout', async () => {
      client.setTimeout(1234);
      fetchMock.mockRejectedValueOnce(abortError());

      const error = await catchTyped(client.index(doc));

      expect(error.message).toContain('timed out after 1234ms');
    });
  });

  // ── query ───────────────────────────────────────────────────────────────

  describe('query', () => {
    it('hace POST /query y retorna los resultados parseados', async () => {
      fetchMock.mockResolvedValueOnce(okResponse(queryResults));

      const results = await client.query({ text: 'búsqueda', limit: 5 });

      expect(results).toEqual(queryResults);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:9621/query');
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify({ text: 'búsqueda', limit: 5 }));

      const completed = eventsOf('lightrag.query.completed');
      expect(completed).toHaveLength(1);
      expect(completed[0]?.payload).toMatchObject({ query: 'búsqueda', resultCount: 2 });
    });

    it('HTTP 404 → NinjaError LIGHTRAG_NOT_FOUND (nunca throw crudo)', async () => {
      fetchMock.mockResolvedValue(errResponse(404, 'Not Found'));

      const error = await catchTyped(client.query({ text: 'x' }));

      expect(error.code).toBe('LIGHTRAG_NOT_FOUND');
      expect(client.isAvailable).toBe(false);
    });

    it('timeout → NinjaError LIGHTRAG_TIMEOUT', async () => {
      fetchMock.mockRejectedValueOnce(abortError());

      const error = await catchTyped(client.query({ text: 'x' }));

      expect(error.code).toBe('LIGHTRAG_TIMEOUT');
    });

    it('respuesta con JSON inválido → NinjaError tipado, no SyntaxError crudo', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      } as unknown as Response);

      const error = await catchTyped(client.query({ text: 'x' }));

      expect(error.code).toBe('LIGHTRAG_NETWORK_ERROR');
      expect(error.message).toContain('Unexpected token');
    });

    it('retorna [] sin fetch cuando el servicio no está disponible', async () => {
      fetchMock.mockResolvedValue(errResponse(503, 'Service Unavailable'));
      await expect(client.health()).resolves.toBe(false);

      const results = await client.query({ text: 'x' });

      expect(results).toEqual([]);
      expect(fetchMock).toHaveBeenCalledOnce(); // solo el /health
    });
  });

  // ── health ──────────────────────────────────────────────────────────────

  describe('health', () => {
    it('retorna true y actualiza disponibilidad cuando responde ok', async () => {
      fetchMock.mockResolvedValueOnce(okResponse());

      const healthy = await client.health();

      expect(healthy).toBe(true);
      expect(client.isAvailable).toBe(true);
      expect(client.lastHealthCheck).toBeGreaterThan(0);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:9621/health');
      expect(init.method).toBe('GET');
    });

    it('retorna false cuando responde con error HTTP', async () => {
      fetchMock.mockResolvedValue(errResponse(503, 'Service Unavailable'));

      const healthy = await client.health();

      expect(healthy).toBe(false);
      expect(client.isAvailable).toBe(false);
      expect(client.lastHealthCheck).toBeGreaterThan(0);
    });

    it('retorna false y emite lightrag.service.unavailable cuando el fetch rechaza', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      const healthy = await client.health();

      expect(healthy).toBe(false);
      const events = eventsOf('lightrag.service.unavailable');
      expect(events).toHaveLength(1);
      expect(events[0]?.payload).toMatchObject({ error: 'fetch failed' });
    });

    it('el circuit breaker abre tras 3 fallos y los siguientes health no tocan la red', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      for (let i = 0; i < 3; i++) {
        await expect(client.health()).resolves.toBe(false);
      }
      // Al 3er fallo el circuito pasa a OPEN y emite el cambio de estado
      const stateChanged = emitSpy.mock.calls
        .map((c: unknown[]) => c[0] as { type: string; payload: { from: string; to: string } })
        .filter((e: { type: string }) => e.type === 'lightrag.circuit.state_changed');
      expect(stateChanged.some((e: { payload: { to: string } }) => e.payload.to === 'OPEN')).toBe(
        true
      );

      // 4ª llamada: CircuitOpenError → false sin nuevo fetch
      await expect(client.health()).resolves.toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  // ── estado inicial ──────────────────────────────────────────────────────

  it('arranca disponible con lastHealthCheck en 0', () => {
    const fresh = new LightRAGClient();
    expect(fresh.isAvailable).toBe(true);
    expect(fresh.lastHealthCheck).toBe(0);
  });
});
