import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EngramClient } from './engram-client.js';
import { MemoryManager } from './memory-manager.js';

describe('MemoryManager (SQLite :memory:)', () => {
  let client: EngramClient;
  let manager: MemoryManager;

  beforeEach(() => {
    client = new EngramClient(':memory:');
    manager = new MemoryManager({ client });
  });

  afterEach(() => {
    client.close();
  });

  it('writeContext calcula tokens y getContext respeta el budget', async () => {
    const written = await manager.writeContext({
      sessionId: 'sess-m',
      agentId: 'agent-1',
      content: 'hello world memory',
      compressed: false,
      tags: [],
    });
    expect(written.tokenCount).toBe(Math.ceil('hello world memory'.length / 4));
    expect(written.timestamp.length).toBeGreaterThan(0);

    const ctx = await manager.getContext('sess-m', 'agent-1', 100);
    expect(ctx).toHaveLength(1);
    expect(ctx[0].content).toBe('hello world memory');

    const empty = await manager.getContext('sess-m', 'agent-1', 1);
    expect(empty).toEqual([]);
  });

  it('writeContext falla con error propagado si el store falla', async () => {
    const broken = new EngramClient(':memory:');
    broken.close();
    const brokenManager = new MemoryManager({ client: broken });
    await expect(
      brokenManager.writeContext({
        sessionId: 's',
        content: 'x',
        compressed: false,
        tags: [],
      })
    ).rejects.toThrow();
  });
});
