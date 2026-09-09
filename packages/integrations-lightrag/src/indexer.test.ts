import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eventBus } from '@ninja/events';
import { LightRAGIndexer } from './indexer.js';
import type { LightRAGDocument } from './schema.js';

// El indexer usa el singleton del client: se mockea el módulo completo.
vi.mock('./lightrag-client.js', () => ({
  lightragClient: {
    index: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    isAvailable: true,
  },
}));

import { lightragClient } from './lightrag-client.js';

const indexMock = vi.mocked(lightragClient.index);

function makeDoc(id: string, contentLength = 10): LightRAGDocument {
  return {
    id,
    content: 'x'.repeat(contentLength),
    metadata: { source: 'test' },
  };
}

describe('LightRAGIndexer', () => {
  let indexer: LightRAGIndexer;
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    indexer = new LightRAGIndexer();
    indexMock.mockReset().mockResolvedValue(undefined);
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

  describe('indexContent', () => {
    it('genera un ID único y delega en el client', async () => {
      await indexer.indexContent('contenido', { agentId: 'kage' });

      expect(indexMock).toHaveBeenCalledOnce();
      const sent = indexMock.mock.calls[0]?.[0] as LightRAGDocument;
      expect(sent.id).toMatch(/^doc-\d+-[a-z0-9]+$/);
      expect(sent.content).toBe('contenido');
      expect(sent.metadata).toEqual({ agentId: 'kage' });
    });

    it('genera IDs distintos para llamadas consecutivas', async () => {
      await indexer.indexContent('a', {});
      await indexer.indexContent('b', {});

      const id1 = indexMock.mock.calls[0]?.[0]?.id;
      const id2 = indexMock.mock.calls[1]?.[0]?.id;
      expect(id1).not.toBe(id2);
    });
  });

  describe('indexDocument (vía indexBatch)', () => {
    it('emite lightrag.document.indexed con chunk estimado', async () => {
      await indexer.indexBatch([makeDoc('d1', 1200)]);

      const events = eventsOf('lightrag.document.indexed');
      expect(events).toHaveLength(1);
      // ceil(1200/500) = 3 chunks estimados
      expect(events[0]?.payload).toEqual({ docId: 'd1', chunkCount: 3 });
    });

    it('emite lightrag.index.failed y relanza cuando el client falla', async () => {
      indexMock.mockRejectedValue(new Error('HTTP 500: boom'));

      const result = await indexer.indexBatch([makeDoc('d1')]);

      expect(result.indexed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors).toEqual([{ docId: 'd1', error: 'HTTP 500: boom' }]);

      const failed = eventsOf('lightrag.index.failed');
      expect(failed).toHaveLength(1);
      expect(failed[0]?.payload).toEqual({ docId: 'd1', error: 'HTTP 500: boom' });
    });

    it('redacta error no-Error como "Unknown error"', async () => {
      indexMock.mockRejectedValue('string cruda');

      const result = await indexer.indexBatch([makeDoc('d1')]);

      expect(result.errors[0]?.error).toBe('Unknown error');
      expect(eventsOf('lightrag.index.failed')[0]?.payload).toMatchObject({
        error: 'Unknown error',
      });
    });
  });

  describe('indexBatch', () => {
    it('procesa todos los documentos exitosos y retorna conteo', async () => {
      const result = await indexer.indexBatch([makeDoc('d1'), makeDoc('d2'), makeDoc('d3')]);

      expect(result).toEqual({ indexed: 3, failed: 0, errors: [] });
      expect(indexMock).toHaveBeenCalledTimes(3);
    });

    it('mezcla exitosos y fallidos sin cortar el batch', async () => {
      indexMock.mockImplementation(async (d) => {
        if (d.id === 'd2') throw new Error('fallo puntual');
      });

      const result = await indexer.indexBatch([makeDoc('d1'), makeDoc('d2'), makeDoc('d3')]);

      expect(result.indexed).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toEqual([{ docId: 'd2', error: 'fallo puntual' }]);
    });

    it('batch vacío retorna conteos en cero', async () => {
      await expect(indexer.indexBatch([])).resolves.toEqual({
        indexed: 0,
        failed: 0,
        errors: [],
      });
      expect(indexMock).not.toHaveBeenCalled();
    });
  });
});
