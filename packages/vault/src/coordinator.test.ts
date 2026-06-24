import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VaultCoordinator } from './coordinator.js';
import type { MemoryEntry } from '@ninja/integrations-engram';
import type { LightRAGDocument, LightRAGQuery, LightRAGResult } from '@ninja/integrations-lightrag';
import type { Artifact, CreateArtifactOptions } from '@ninja/trace-ledger';
import { ok, err } from '@ninja/contracts';
import { MockEventBus } from '../../../tests/helpers/mock-event-bus.js';
import type { IHotMemoryProvider, VaultEntry } from './schema.js';

class MockEngramClient {
  private memories: MemoryEntry[] = [];

  async store(entry: Omit<MemoryEntry, 'id'>): Promise<any> {
    const memoryEntry: MemoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
    };
    this.memories.push(memoryEntry);
    return ok(memoryEntry);
  }

  async retrieve(query: { sessionId: string; agentId?: string; limit?: number }): Promise<any> {
    const results = this.memories.filter(
      (m) => m.sessionId === query.sessionId && (!query.agentId || m.agentId === query.agentId)
    );
    return ok(results);
  }
}

class MockLightRAGClient {
  private documents: LightRAGDocument[] = [];

  async index(doc: LightRAGDocument): Promise<void> {
    this.documents.push(doc);
  }

  async query(q: LightRAGQuery): Promise<LightRAGResult[]> {
    const results: LightRAGResult[] = this.documents.map((doc) => ({
      documentId: doc.id,
      chunk: doc.content,
      score: 0.8,
    }));
    return results;
  }
}

class MockArtifactRepository {
  private artifacts: Artifact[] = [];

  create(options: CreateArtifactOptions): Artifact {
    const artifact: Artifact = {
      id: crypto.randomUUID(),
      runId: options.runId,
      type: options.type,
      name: options.name,
      content: options.content,
      createdAt: new Date().toISOString(),
    };
    this.artifacts.push(artifact);
    return artifact;
  }

  findByType(type: string): Artifact[] {
    return this.artifacts.filter((a) => a.type === type);
  }
}

class MockHotMemoryProvider implements IHotMemoryProvider {
  private entries: VaultEntry[] = [];

  setEntries(entries: VaultEntry[]): void {
    this.entries = entries;
  }

  async getEntries(): Promise<VaultEntry[]> {
    return this.entries;
  }
}

describe('VaultCoordinator', () => {
  let mockEventBus: MockEventBus;
  let mockEngramClient: MockEngramClient;
  let mockLightRAGClient: MockLightRAGClient;
  let mockArtifactRepository: MockArtifactRepository;
  let mockHotMemoryProvider: MockHotMemoryProvider;
  let coordinator: VaultCoordinator;

  const agentId = 'test-agent';
  const sessionId = 'test-session';

  beforeEach(() => {
    mockEventBus = new MockEventBus();
    mockEngramClient = new MockEngramClient();
    mockLightRAGClient = new MockLightRAGClient();
    mockArtifactRepository = new MockArtifactRepository();
    mockHotMemoryProvider = new MockHotMemoryProvider();

    coordinator = new VaultCoordinator({
      engram: mockEngramClient as any,
      lightrag: mockLightRAGClient as any,
      traceLedger: { artifactRepository: mockArtifactRepository as any },
      hotMemoryProvider: mockHotMemoryProvider,
      eventBus: mockEventBus as any,
    });
  });

  describe('query', () => {
    it('devuelve contexto dentro del budget', async () => {
      const longContent = 'a'.repeat(400);
      const entries: VaultEntry[] = Array(5).fill(null).map((_, i) => ({
        content: `${longContent} entry-${i}`,
        layer: 'HOT' as const,
        relevance: 0.9 - i * 0.1,
        timestamp: new Date().toISOString(),
      }));

      mockHotMemoryProvider.setEntries(entries);

      const result = await coordinator.query({
        agentId,
        sessionId,
        query: 'test',
        layers: ['HOT'],
        tokenBudget: 250,
      });

      expect(result).toBeDefined();
      expect(result[0]).toBeDefined();
      expect(result[0].totalTokens).toBeLessThanOrEqual(250);
    });

    it('emite vault.query.executed al completar', async () => {
      mockHotMemoryProvider.setEntries([]);

      await coordinator.query({
        agentId,
        sessionId,
        query: 'test',
        layers: ['HOT'],
        tokenBudget: 1000,
      });

      const executedEvents = mockEventBus.getEvents('vault.query.executed');
      expect(executedEvents).toHaveLength(1);
    });

    it('lanza error si layers está vacío', async () => {
      await expect(
        coordinator.query({
          agentId,
          sessionId,
          query: 'test',
          layers: [],
          tokenBudget: 1000,
        })
      ).rejects.toThrow('VaultQuery.layers must contain at least one layer');
    });

    it('continúa aunque capas fallen', async () => {
      mockHotMemoryProvider.setEntries([]);

      const result = await coordinator.query({
        agentId,
        sessionId,
        query: 'test',
        layers: ['HOT', 'WARM', 'COLD', 'ANCHORS'],
        tokenBudget: 5000,
      });

      expect(result).toBeDefined();
    });
  });

  describe('write', () => {
    it('persiste en WARM vía EngramClient', async () => {
      await coordinator.write(agentId, sessionId, 'decision arquitectura', 'WARM');

      const events = mockEventBus.getEvents('vault.write.executed');
      expect(events).toHaveLength(1);
      expect(events[0].payload).toMatchObject({
        layer: 'WARM',
        agentId,
        sessionId,
      });
    });

    it('persiste en COLD vía LightRAGClient', async () => {
      const originalUrl = process.env.LIGHTRAG_API_URL;
      process.env.LIGHTRAG_API_URL = 'http://localhost:8000';
      try {
        await coordinator.write(agentId, sessionId, 'documento historial', 'COLD');

        const events = mockEventBus.getEvents('vault.write.executed');
        expect(events).toHaveLength(1);
        expect(events[0].payload).toMatchObject({
          layer: 'COLD',
          agentId,
          sessionId,
        });
      } finally {
        process.env.LIGHTRAG_API_URL = originalUrl;
      }
    });

    it('persiste en ANCHORS vía TraceLedger', async () => {
      await coordinator.write(agentId, sessionId, 'anchor decision', 'ANCHORS');

      const events = mockEventBus.getEvents('vault.write.executed');
      expect(events).toHaveLength(1);
      expect(events[0].payload).toMatchObject({
        layer: 'ANCHORS',
        agentId,
        sessionId,
      });
    });

    it('delega HOT a Agent Runtime', async () => {
      await coordinator.write(agentId, sessionId, 'hot memory', 'HOT');

      const events = mockEventBus.getEvents('vault.write.executed');
      expect(events).toHaveLength(0);
    });
  });
});
