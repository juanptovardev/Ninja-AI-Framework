/**
 * @ninja/integrations-engram — memory-manager.ts
 * Gestor de contexto de memoria con token budget y compresión automática.
 */

import type { ID } from '@ninja/contracts';
import { eventBus, createEvent } from '@ninja/events';
import { createLogger } from '@ninja/logging';
import type {
  MemoryEntry,
  MemoryContextRetrievedPayload,
  MemoryCompressedPayload,
} from './schema.js';
import { EngramClient, engramClient } from './engram-client.js';

const log = createLogger('memory-manager');

interface MemoryManagerDeps {
  client: EngramClient;
  eventBus?: typeof eventBus;
}

export class MemoryManager {
  private client: EngramClient;
  private eventBus: typeof eventBus;
  private criticalTags: string[];

  constructor(deps: MemoryManagerDeps) {
    this.client = deps.client;
    this.eventBus = deps.eventBus ?? eventBus;
    this.criticalTags = ['important', 'decision', 'critical', 'error'];
  }

  async getContext(
    sessionId: ID,
    agentId: ID | undefined,
    tokenBudget: number
  ): Promise<MemoryEntry[]> {
    const result = await this.client.retrieve({ sessionId, agentId });
    if (!result.success) {
      log.warn('Failed to retrieve context', { sessionId, error: result.error.message });
      return [];
    }

    const entries = result.data;
    const selected: MemoryEntry[] = [];
    let tokensUsed = 0;

    for (const entry of entries) {
      const content = entry.compressed ? this.client.decompress(entry.content) : entry.content;
      const tokenCount = entry.compressed ? this.estimateTokens(content) : entry.tokenCount;

      if (tokensUsed + tokenCount > tokenBudget) {
        break;
      }

      tokensUsed += tokenCount;
      selected.push({ ...entry, content, tokenCount, compressed: false });
    }

    this.emitContextRetrieved(sessionId, agentId, tokenBudget, tokensUsed, selected.length);
    log.info('Context retrieved', { sessionId, tokensUsed, entriesCount: selected.length });

    return selected;
  }

  async writeContext(
    entry: Omit<MemoryEntry, 'id' | 'timestamp' | 'tokenCount'>
  ): Promise<MemoryEntry> {
    const tokenCount = this.estimateTokens(entry.content);
    const fullEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      tokenCount,
    };

    const result = await this.client.store(fullEntry);
    if (!result.success) {
      throw result.error;
    }

    log.info('Context written', { id: result.data.id, sessionId: result.data.sessionId });
    return result.data;
  }

  async compressOldEntries(sessionId: ID, olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    const cutoffTimestamp = new Date(cutoff).toISOString();

    const result = await this.client.retrieve({ sessionId, fromTimestamp: cutoffTimestamp });
    if (!result.success) {
      log.warn('Failed to retrieve for compression', { sessionId, error: result.error.message });
      return 0;
    }

    const toCompress = result.data.filter((e) => !e.compressed && this.shouldCompress(e));
    let compressedCount = 0;

    for (const entry of toCompress) {
      const compressionResult = this.client.compress(entry.content);
      await this.client.delete(entry.id);
      await this.client.store({
        ...entry,
        content: compressionResult.compressed,
        compressed: true,
        tokenCount: compressionResult.compressedTokens,
      });
      compressedCount++;
      log.debug('Entry compressed', { id: entry.id, ratio: compressionResult.ratio });
    }

    this.emitMemoryCompressed(sessionId, compressedCount);
    log.info('Old entries compressed', { sessionId, count: compressedCount });

    return compressedCount;
  }

  private shouldCompress(entry: MemoryEntry): boolean {
    if (entry.content.length < 500) return false;
    if (entry.tags.some((t) => this.criticalTags.includes(t))) return false;

    const uniqueWords = new Set(entry.content.split(/\s+/)).size;
    const density = uniqueWords / entry.content.length;

    return density < 0.1;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private emitContextRetrieved(
    sessionId: ID,
    agentId: ID | undefined,
    tokenBudget: number,
    tokensUsed: number,
    entriesCount: number
  ): void {
    const payload: MemoryContextRetrievedPayload = {
      sessionId,
      agentId,
      tokenBudget,
      tokensUsed,
      entriesCount,
    };
    const evt = createEvent('engram.context.retrieved', 'integrations-engram', payload);
    this.eventBus.emit(evt);
  }

  private emitMemoryCompressed(sessionId: ID, count: number): void {
    const payload: MemoryCompressedPayload = { sessionId, count };
    const evt = createEvent('engram.memory.compressed', 'integrations-engram', payload);
    this.eventBus.emit(evt);
  }
}

export const memoryManager = new MemoryManager({ client: engramClient });
