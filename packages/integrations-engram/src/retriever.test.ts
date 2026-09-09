import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EngramClient } from './engram-client.js';
import { MemoryRetriever } from './retriever.js';
import type { MemoryEntry } from './schema.js';

function makeEntry(ts: string, tags: string[], content: string): MemoryEntry {
  return {
    id: `id-${ts}`,
    sessionId: 'sess-r',
    content,
    compressed: false,
    tokenCount: Math.ceil(content.length / 4),
    timestamp: ts,
    tags,
  };
}

describe('MemoryRetriever', () => {
  let client: EngramClient;
  let retriever: MemoryRetriever;

  beforeEach(() => {
    client = new EngramClient(':memory:');
    retriever = new MemoryRetriever(client);
  });

  afterEach(() => {
    client.close();
  });

  it('rankByRecency ordena de mas nuevo a mas viejo', () => {
    const entries = [
      makeEntry('2026-01-01T00:00:00.000Z', [], 'old content here'),
      makeEntry('2026-06-01T00:00:00.000Z', [], 'new content here'),
      makeEntry('2026-03-01T00:00:00.000Z', [], 'mid content here'),
    ];
    const ranked = retriever.rankByRecency(entries);
    expect(ranked.map((e) => e.content)).toEqual([
      'new content here',
      'mid content here',
      'old content here',
    ]);
  });

  it('rankByTags prioriza coincidencias de tags', () => {
    const entries = [
      makeEntry('2026-01-01T00:00:00.000Z', ['other'], 'entry one text'),
      makeEntry('2026-01-01T00:00:00.000Z', ['decision', 'other'], 'entry two text'),
    ];
    const ranked = retriever.rankByTags(entries, ['decision']);
    expect(ranked[0].content).toBe('entry two text');
    expect(ranked[1].content).toBe('entry one text');
  });

  it('getRelevant respeta el tokenBudget y devuelve contenido', async () => {
    await client.store({
      sessionId: 'sess-r',
      content: 'short one',
      compressed: false,
      tokenCount: 3,
      timestamp: '2026-01-01T00:00:00.000Z',
      tags: [],
    });
    await client.store({
      sessionId: 'sess-r',
      content: 'short two',
      compressed: false,
      tokenCount: 3,
      timestamp: '2026-02-01T00:00:00.000Z',
      tags: [],
    });
    const all = await retriever.getRelevant({ sessionId: 'sess-r' }, 100);
    expect(all).toHaveLength(2);
    const limited = await retriever.getRelevant({ sessionId: 'sess-r' }, 3);
    expect(limited).toHaveLength(1);
    expect(limited[0].compressed).toBe(false);
  });

  it('getRelevant combina recencia y tags cuando hay query tags', async () => {
    await client.store({
      sessionId: 'sess-r2',
      content: 'old but tagged entry here',
      compressed: false,
      tokenCount: 7,
      timestamp: '2026-01-01T00:00:00.000Z',
      tags: ['decision'],
    });
    await client.store({
      sessionId: 'sess-r2',
      content: 'new untagged entry here now',
      compressed: false,
      tokenCount: 7,
      timestamp: '2026-06-01T00:00:00.000Z',
      tags: [],
    });
    const res = await retriever.getRelevant({ sessionId: 'sess-r2', tags: ['decision'] }, 100);
    expect(res).toHaveLength(1);
    expect(res[0].tags).toContain('decision');
  });

  it('getRelevant devuelve vacio si la sesion no existe', async () => {
    const res = await retriever.getRelevant({ sessionId: 'no-such-session' }, 100);
    expect(res).toEqual([]);
  });
});
