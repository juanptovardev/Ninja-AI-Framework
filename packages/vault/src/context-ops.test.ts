import { describe, it, expect, beforeEach } from 'vitest';
import { ContextOps } from './context-ops.js';
import { AgentNamespaceManager } from './agent-namespace.js';
import { MockEventBus } from '../../../tests/helpers/mock-event-bus.js';
import type { Artifact, CreateArtifactOptions } from '@ninja/trace-ledger';
import { engramClient, memoryCompressor } from '@ninja/integrations-engram';
import { vi } from 'vitest';

vi.mock('@ninja/integrations-engram', () => ({
  engramClient: {
    store: vi.fn().mockResolvedValue({ isOk: true, value: { id: 'mock-id' } }),
  },
  memoryCompressor: {
    compress: vi.fn((entry) => ({
      original: entry.content,
      compressed: 'compressed mock',
      originalTokens: entry.tokens || 10,
      compressedTokens: 2,
      ratio: 5,
    })),
  },
}));

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

describe('ContextOps', () => {
  let mockEventBus: MockEventBus;
  let mockArtifactRepo: MockArtifactRepository;
  let contextOps: ContextOps;
  let namespaceManager: AgentNamespaceManager;

  const agentId = 'test-agent';
  const sessionId = 'test-session';
  const workspaceId = 'test-workspace';

  beforeEach(() => {
    mockEventBus = new MockEventBus();
    mockArtifactRepo = new MockArtifactRepository();
    namespaceManager = new AgentNamespaceManager();

    contextOps = new ContextOps({
      namespaceManager,
      eventBus: mockEventBus as any,
      artifactRepo: mockArtifactRepo as any,
      engramClient: engramClient as any,
      memoryCompressor: memoryCompressor as any,
    });
  });

  describe('getContext', () => {
    it('ejecuta sin error', async () => {
      await contextOps.writeContext(agentId, sessionId, workspaceId, 'test content', 'HOT');
      await contextOps.writeContext(agentId, sessionId, workspaceId, 'more content', 'HOT');

      const result = await contextOps.getContext(agentId, sessionId, workspaceId, 10000);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('con agentId inexistente retorna contexto vacío', async () => {
      const result = await contextOps.getContext(
        'nonexistent-agent',
        sessionId,
        workspaceId,
        5000
      );

      expect(result).toEqual([]);
      expect(result.length).toBe(0);
    });
  });

  describe('writeContext', () => {
    it('ejecuta sin error', async () => {
      await expect(
        contextOps.writeContext(agentId, sessionId, workspaceId, 'contenido de prueba', 'HOT')
      ).resolves.not.toThrow();

      const namespace = namespaceManager.getNamespace(agentId, sessionId, workspaceId);
      expect(namespace).toBeDefined();
      expect(namespace?.hotMemory.length).toBe(1);
    });

    it('almacena en EngramClient para WARM', async () => {
      await contextOps.writeContext(agentId, sessionId, workspaceId, 'warm content', 'WARM');
      
      expect(engramClient.store).toHaveBeenCalledWith(expect.objectContaining({
        agentId,
        sessionId,
        content: 'warm content',
        compressed: false,
      }));
    });
  });

  describe('compressContext', () => {
    it('ejecuta sin error', async () => {
      await contextOps.writeContext(agentId, sessionId, workspaceId, 'content 1', 'HOT');
      await contextOps.writeContext(agentId, sessionId, workspaceId, 'content 2', 'HOT');

      const result = await contextOps.compressContext(agentId, sessionId, workspaceId, 'WARM');

      expect(result).toBeDefined();
      expect(result.ratio).toBe(1.5);
      expect(result.entriesProcessed).toBe(2);
    });

    it('comprime con ratio 5:1 usando memoryCompressor para WARM', async () => {
      await contextOps.writeContext(agentId, sessionId, workspaceId, 'a'.repeat(100), 'HOT');

      const result = await contextOps.compressContext(agentId, sessionId, workspaceId, 'WARM');

      expect(memoryCompressor.compress).toHaveBeenCalled();
      expect(engramClient.store).toHaveBeenCalledWith(expect.objectContaining({
        compressed: true,
        content: 'compressed mock'
      }));
      expect(result.ratio).toBeGreaterThan(0);
      expect(result.layer).toBe('WARM');
    });

    it('retorna zeros para namespace inexistente', async () => {
      const result = await contextOps.compressContext(
        'nonexistent-agent',
        sessionId,
        workspaceId,
        'WARM'
      );

      expect(result.originalTokens).toBe(0);
      expect(result.compressedTokens).toBe(0);
      expect(result.ratio).toBe(0);
      expect(result.entriesProcessed).toBe(0);
    });

    it('emite evento context.compressed', async () => {
      await contextOps.writeContext(agentId, sessionId, workspaceId, 'content', 'HOT');

      await contextOps.compressContext(agentId, sessionId, workspaceId, 'WARM');

      const events = mockEventBus.getEvents('context.compressed');
      expect(events).toHaveLength(1);
      expect(events[0].payload).toMatchObject({
        agentId,
        sessionId,
        workspaceId,
      });
    });
  });

  describe('promoteHotToWarm', () => {
    it('comprime a WARM si supera el umbral de tokens', async () => {
      // Mock para getTokenBudget y compressContext
      vi.spyOn(contextOps, 'getTokenBudget').mockReturnValue({
        maxTokens: 8000,
        usedTokens: 8001,
        remainingTokens: 0,
      });
      vi.spyOn(contextOps, 'compressContext');

      await contextOps.promoteHotToWarm(agentId, sessionId, workspaceId);

      expect(contextOps.compressContext).toHaveBeenCalledWith(agentId, sessionId, workspaceId, 'WARM');
    });

    it('no comprime si no supera el umbral', async () => {
      vi.spyOn(contextOps, 'getTokenBudget').mockReturnValue({
        maxTokens: 8000,
        usedTokens: 5000,
        remainingTokens: 3000,
      });
      vi.spyOn(contextOps, 'compressContext');

      await contextOps.promoteHotToWarm(agentId, sessionId, workspaceId);

      expect(contextOps.compressContext).not.toHaveBeenCalled();
    });
  });

  describe('extractAnchors', () => {
    it('identifica entries con isAnchor=true', async () => {
      const namespace = namespaceManager.getOrCreate(agentId, sessionId, workspaceId);
      namespace.hotMemory.push({
        id: 'anchor-1',
        agentId,
        sessionId,
        workspaceId,
        content: 'anchor content 1',
        layer: 'HOT',
        timestamp: new Date().toISOString(),
        tokens: 10,
        relevance: 0.5,
        lastAccess: new Date().toISOString(),
        isAnchor: true,
      });
      namespace.hotMemory.push({
        id: 'normal-1',
        agentId,
        sessionId,
        workspaceId,
        content: 'normal content',
        layer: 'HOT',
        timestamp: new Date().toISOString(),
        tokens: 10,
        relevance: 0.5,
        lastAccess: new Date().toISOString(),
        isAnchor: false,
      });

      const anchors = await contextOps.extractAnchors(sessionId, workspaceId);

      expect(anchors).toHaveLength(1);
      expect(anchors[0].isAnchor).toBe(true);
    });

    it('persiste anchors en ArtifactRepository', async () => {
      const namespace = namespaceManager.getOrCreate(agentId, sessionId, workspaceId);
      namespace.hotMemory.push({
        id: 'anchor-1',
        agentId,
        sessionId,
        workspaceId,
        content: 'anchor decision',
        layer: 'HOT',
        timestamp: new Date().toISOString(),
        tokens: 10,
        relevance: 0.5,
        lastAccess: new Date().toISOString(),
        isAnchor: true,
      });

      await contextOps.extractAnchors(sessionId, workspaceId);

      const artifacts = mockArtifactRepo.findByType('anchor');
      expect(artifacts).toHaveLength(1);
    });

    it('emite evento context.anchor.promoted', async () => {
      const namespace = namespaceManager.getOrCreate(agentId, sessionId, workspaceId);
      namespace.hotMemory.push({
        id: 'anchor-1',
        agentId,
        sessionId,
        workspaceId,
        content: 'anchor content',
        layer: 'HOT',
        timestamp: new Date().toISOString(),
        tokens: 10,
        relevance: 0.5,
        lastAccess: new Date().toISOString(),
        isAnchor: true,
      });

      await contextOps.extractAnchors(sessionId, workspaceId);

      const events = mockEventBus.getEvents('context.anchor.promoted');
      expect(events).toHaveLength(1);
      expect(events[0].payload).toMatchObject({
        sessionId,
        workspaceId,
        anchorsCount: 1,
      });
    });

    it('no emite evento si no hay anchors', async () => {
      const namespace = namespaceManager.getOrCreate(agentId, sessionId, workspaceId);
      namespace.hotMemory.push({
        id: 'normal-1',
        agentId,
        sessionId,
        workspaceId,
        content: 'normal content',
        layer: 'HOT',
        timestamp: new Date().toISOString(),
        tokens: 10,
        relevance: 0.5,
        lastAccess: new Date().toISOString(),
        isAnchor: false,
      });

      await contextOps.extractAnchors(sessionId, workspaceId);

      const events = mockEventBus.getEvents('context.anchor.promoted');
      expect(events).toHaveLength(0);
    });
  });

  describe('getTokenBudget', () => {
    it('calcula usedTokens y remainingTokens correctamente', async () => {
      await contextOps.writeContext(agentId, sessionId, workspaceId, 'a'.repeat(100), 'HOT');
      await contextOps.writeContext(agentId, sessionId, workspaceId, 'b'.repeat(100), 'HOT');

      const budget = contextOps.getTokenBudget(agentId, sessionId, workspaceId, 10000);

      expect(budget.maxTokens).toBe(10000);
      expect(budget.usedTokens).toBeGreaterThan(0);
      expect(budget.remainingTokens).toBeLessThanOrEqual(10000);
    });
  });
});
