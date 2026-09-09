import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EngramClient } from './engram-client.js';

describe('EngramClient (SQLite :memory:)', () => {
  let client: EngramClient;

  beforeEach(() => {
    client = new EngramClient(':memory:');
  });

  afterEach(() => {
    client.close();
  });

  function baseEntry(sessionId = 'sess-1', tags: string[] = ['t1']) {
    return {
      sessionId,
      agentId: 'agent-1',
      content: '  Hello,   world!  ',
      compressed: false,
      tokenCount: 5,
      timestamp: new Date().toISOString(),
      tags,
    };
  }

  it('store + retrieve hacen round-trip con el contenido intacto', async () => {
    const stored = await client.store(baseEntry());
    expect(stored.success).toBe(true);
    if (!stored.success) return;
    expect(stored.data.id.length).toBeGreaterThan(0);

    const found = await client.retrieve({ sessionId: 'sess-1' });
    expect(found.success).toBe(true);
    if (!found.success) return;
    expect(found.data).toHaveLength(1);
    expect(found.data[0].content).toBe('  Hello,   world!  ');
    expect(found.data[0].tags).toEqual(['t1']);
  });

  it('retrieve filtra por agentId y tags', async () => {
    await client.store({ ...baseEntry('sess-9', ['alpha']), agentId: 'a1' });
    await client.store({ ...baseEntry('sess-9', ['beta']), agentId: 'a2' });

    const byAgent = await client.retrieve({ sessionId: 'sess-9', agentId: 'a2' });
    expect(byAgent.success && byAgent.data).toBeTruthy();
    if (!byAgent.success) return;
    expect(byAgent.data).toHaveLength(1);
    expect(byAgent.data[0].agentId).toBe('a2');

    const byTag = await client.retrieve({ sessionId: 'sess-9', tags: ['beta'] });
    if (!byTag.success) return;
    expect(byTag.data).toHaveLength(1);
    expect(byTag.data[0].tags).toEqual(['beta']);
  });

  it('retrieve respeta el limit', async () => {
    await client.store(baseEntry('sess-lim'));
    await client.store(baseEntry('sess-lim'));
    await client.store(baseEntry('sess-lim'));
    const found = await client.retrieve({ sessionId: 'sess-lim', limit: 2 });
    if (!found.success) return;
    expect(found.data).toHaveLength(2);
  });

  it('delete elimina y el segundo delete reporta not-found', async () => {
    const stored = await client.store(baseEntry());
    if (!stored.success) return;
    const first = await client.delete(stored.data.id);
    expect(first.success).toBe(true);

    const second = await client.delete(stored.data.id);
    expect(second.success).toBe(false);
  });

  it('delete de id inexistente devuelve error', async () => {
    const res = await client.delete('no-existe');
    expect(res.success).toBe(false);
  });

  it('compress colapsa espacios y calcula ratio < 1', () => {
    const out = client.compress('  Hello,   world!  ');
    expect(out.compressed).toBe('Hello, world!');
    expect(out.originalTokens).toBe(Math.ceil('  Hello,   world!  '.length / 4));
    expect(out.ratio).toBeLessThan(1);
  });

  it('decompress restaura espacio tras puntuacion', () => {
    expect(client.decompress('Hello,world!')).toBe('Hello, world!');
  });
});
