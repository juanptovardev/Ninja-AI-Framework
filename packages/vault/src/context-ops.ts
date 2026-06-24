import type { ID, Timestamp } from '@ninja/contracts';
import { EventBus, createEvent } from '@ninja/events';
import { AgentNamespaceManager } from './agent-namespace.js';
import type { VaultEntry, MemoryLayer, ContextCompressedPayload, ContextAnchorPromotedPayload } from './schema.js';
import type { ArtifactRepository } from '@ninja/trace-ledger';
import type { CompressionResult } from './schema.js';
import { engramClient, memoryCompressor } from '@ninja/integrations-engram';
import type { EngramClient, MemoryCompressor } from '@ninja/integrations-engram';

export interface TokenBudget {
  maxTokens: number;
  usedTokens: number;
  remainingTokens: number;
}

export interface ContextRequest {
  agentId: ID;
  sessionId: ID;
  workspaceId: ID;
  tokenBudget: number;
  includeAnchors?: boolean;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class ContextOps {
  private namespaceManager: AgentNamespaceManager;
  private eventBus: EventBus;
  private artifactRepo: ArtifactRepository;
  private engramClient: EngramClient;
  private memoryCompressor: MemoryCompressor;

  constructor(deps: {
    namespaceManager?: AgentNamespaceManager;
    eventBus: EventBus;
    artifactRepo: ArtifactRepository;
    engramClient?: EngramClient;
    memoryCompressor?: MemoryCompressor;
  }) {
    this.namespaceManager = deps.namespaceManager ?? new AgentNamespaceManager();
    this.eventBus = deps.eventBus;
    this.artifactRepo = deps.artifactRepo;
    this.engramClient = deps.engramClient ?? engramClient;
    this.memoryCompressor = deps.memoryCompressor ?? memoryCompressor;
  }

  async getContext(
    agentId: ID,
    sessionId: ID,
    workspaceId: ID,
    tokenBudget: number
  ): Promise<VaultEntry[]> {
    const namespace = this.namespaceManager.getOrCreate(agentId, sessionId, workspaceId);

    const result: VaultEntry[] = [];
    let currentTokens = 0;

    const hotEntries = [...namespace.hotMemory].sort(
      (a, b) =>
        new Date(b.lastAccess ?? b.timestamp).getTime() -
        new Date(a.lastAccess ?? a.timestamp).getTime()
    );

    for (const entry of hotEntries) {
      const entryTokens = entry.tokens || estimateTokens(entry.content);

      if (currentTokens + entryTokens <= tokenBudget) {
        result.push(entry);
        currentTokens += entryTokens;
      } else {
        break;
      }
    }

    return result;
  }

  async writeContext(
    agentId: ID,
    sessionId: ID,
    workspaceId: ID,
    content: string,
    layer: 'HOT' | 'WARM' = 'HOT'
  ): Promise<void> {
    const entry: VaultEntry = {
      id: crypto.randomUUID(),
      agentId,
      sessionId,
      workspaceId,
      layer,
      content,
      tokens: estimateTokens(content),
      timestamp: new Date().toISOString(),
      lastAccess: new Date().toISOString(),
      relevance: 0.5,
    };

    if (layer === 'HOT') {
      this.namespaceManager.appendToHotMemory(agentId, sessionId, entry);
    } else if (layer === 'WARM') {
      await this.engramClient.store({
        sessionId,
        agentId,
        content,
        compressed: false,
        tokenCount: entry.tokens || 0,
        timestamp: entry.timestamp,
        tags: [workspaceId],
      });
    } else {
      throw new Error(`Layer ${layer} compression not yet implemented`);
    }
  }

  async compressContext(
    agentId: ID,
    sessionId: ID,
    workspaceId: ID,
    targetLayer: 'WARM' | 'COLD'
  ): Promise<CompressionResult> {
    const namespace = this.namespaceManager.getNamespace(agentId, sessionId, workspaceId);

    if (!namespace) {
      return {
        originalTokens: 0,
        compressedTokens: 0,
        ratio: 0,
        layer: targetLayer,
        entriesProcessed: 0,
      };
    }

    const hotEntries = namespace.hotMemory;
    const totalTokens = hotEntries.reduce((sum, entry) => sum + (entry.tokens || 0), 0);

    let compressedTokens = 0;
    
    for (const entry of hotEntries) {
      if (targetLayer === 'WARM') {
        const result = this.memoryCompressor.compress({
          id: entry.id || crypto.randomUUID(),
          sessionId: entry.sessionId ?? sessionId,
          agentId: entry.agentId ?? agentId,
          content: entry.content,
          compressed: false,
          tokenCount: entry.tokens || estimateTokens(entry.content),
          timestamp: entry.timestamp,
          tags: [entry.workspaceId ?? workspaceId]
        });
        
        await this.engramClient.store({
          sessionId: entry.sessionId ?? sessionId,
          agentId: entry.agentId ?? agentId,
          content: result.compressed,
          compressed: true,
          tokenCount: result.compressedTokens,
          timestamp: new Date().toISOString(),
          tags: [entry.workspaceId ?? workspaceId],
        });
        
        compressedTokens += result.compressedTokens;
      }
    }

    const compressionRatio = totalTokens > 0 ? totalTokens / compressedTokens : 1;

    const result: CompressionResult = {
      originalTokens: totalTokens,
      compressedTokens,
      ratio: compressionRatio,
      layer: targetLayer,
      entriesProcessed: hotEntries.length,
    };

    namespace.hotMemory = [];

    // Emitir evento context.compressed
    const payload: ContextCompressedPayload = {
      agentId,
      sessionId,
      workspaceId,
      originalTokens: result.originalTokens,
      compressedTokens: result.compressedTokens,
      ratio: result.ratio,
      layer: result.layer,
      entriesProcessed: result.entriesProcessed,
    };

    const evt = createEvent('context.compressed', 'vault', payload);
    this.eventBus.emit(evt);

    return result;
  }

  async extractAnchors(sessionId: ID, workspaceId: ID): Promise<VaultEntry[]> {
    const namespaces = this.namespaceManager.getNamespacesBySession(sessionId, workspaceId);
    const anchors: VaultEntry[] = [];
    const anchorIds: ID[] = [];
    let totalTokens = 0;

    for (const namespace of namespaces) {
      for (const entry of namespace.hotMemory) {
        if (entry.isAnchor) {
          // Persistir anchor en el Trace Ledger
          const artifact = this.artifactRepo.create({
            runId: sessionId,
            type: 'anchor',
            name: `anchor-${entry.id ?? crypto.randomUUID()}`,
            content: entry.content,
          });

          anchorIds.push(artifact.id);
          totalTokens += entry.tokens || estimateTokens(entry.content);

          const anchorEntry: VaultEntry = {
            ...entry,
            layer: 'ANCHORS',
            lastAccess: new Date().toISOString(),
          };
          anchors.push(anchorEntry);
        }
      }
    }

    // Emitir evento context.anchor.promoted si hay anchors
    if (anchors.length > 0) {
      const payload: ContextAnchorPromotedPayload = {
        sessionId,
        workspaceId,
        anchorsCount: anchors.length,
        anchorIds,
        totalTokens,
      };

      const evt = createEvent('context.anchor.promoted', 'vault', payload);
      this.eventBus.emit(evt);
    }

    return anchors;
  }

  getTokenBudget(agentId: ID, sessionId: ID, workspaceId: ID, maxTokens: number): TokenBudget {
    const namespace = this.namespaceManager.getOrCreate(agentId, sessionId, workspaceId);
    const usedTokens = namespace.hotMemory.reduce((sum, entry) => sum + (entry.tokens || 0), 0);

    return {
      maxTokens,
      usedTokens,
      remainingTokens: Math.max(0, maxTokens - usedTokens),
    };
  }

  async promoteHotToWarm(
    agentId: ID,
    sessionId: ID,
    workspaceId: ID,
    thresholdTokens = 8000
  ): Promise<void> {
    const budget = this.getTokenBudget(agentId, sessionId, workspaceId, thresholdTokens);
    if (budget.usedTokens > thresholdTokens) {
      await this.compressContext(agentId, sessionId, workspaceId, 'WARM');
    }
  }
}
