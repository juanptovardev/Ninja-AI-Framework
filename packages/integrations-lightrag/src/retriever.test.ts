import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eventBus } from '@ninja/events';
import { LightRAGRetriever } from './retriever.js';
import type { LightRAGResult } from './schema.js';

// El retriever usa el singleton del client: se mockea el módulo completo.
vi.mock('./lightrag-client.js', () => ({
  lightragClient: {
    index: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    isAvailable: true,
  },
}));

import { lightragClient } from './lightrag-client.js';

const queryMock = vi.mocked(lightragClient.query);
const mockedClient = lightragClient as unknown as { isAvailable: boolean };

const results: LightRAGResult[] = [
  { documentId: 'doc-1', chunk: 'fragmento relevante', score: 0.87 },
  { documentId: 'doc-2', chunk: 'otro fragmento', score: 0.42 },
];

describe('LightRAGRetriever', () => {
  let retriever: LightRAGRetriever;
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    retriever = new LightRAGRetriever();
    queryMock.mockReset().mockResolvedValue([]);
    mockedClient.isAvailable = true;
    emitSpy = vi.spyOn(eventBus, 'emit').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function eventsOf(type: string): Array<{ payload: Record<string, unknown> }> {
    return emitSpy.mock.calls
      .map((c: unknown[]) => c[0] as { type: string; payload: Record<string, unknown> })
      .filter((e: { type: string }) => e.type === type);
  }

  it('delega en client.query con text y limit', async () => {
    queryMock.mockResolvedValueOnce(results);

    const out = await retriever.retrieve('búsqueda semántica', 7);

    expect(out).toEqual(results);
    expect(queryMock).toHaveBeenCalledWith({ text: 'búsqueda semántica', limit: 7 });
  });

  it('retorna [] sin consultar cuando el servicio no está disponible', async () => {
    mockedClient.isAvailable = false;

    const out = await retriever.retrieve('consulta', 5);

    expect(out).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
    expect(eventsOf('lightrag.query.executed')).toHaveLength(0);
  });

  it('emite lightrag.query.executed con conteo y latencia', async () => {
    queryMock.mockResolvedValueOnce(results);

    await retriever.retrieve('q', 10);

    const events = eventsOf('lightrag.query.executed');
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({
      query: 'q',
      resultCount: 2,
      latencyMs: expect.any(Number),
    });
  });

  it('no lanza cuando query falla: retorna [] y registra el fallo', async () => {
    queryMock.mockRejectedValueOnce(new Error('HTTP 500: Internal Server Error'));

    await expect(retriever.retrieve('q')).resolves.toEqual([]);

    expect(eventsOf('lightrag.query.executed')).toHaveLength(0);
  });

  it('pasa limit undefined cuando no se especifica', async () => {
    queryMock.mockResolvedValueOnce([]);

    await retriever.retrieve('sin límite');

    expect(queryMock).toHaveBeenCalledWith({ text: 'sin límite', limit: undefined });
  });
});
