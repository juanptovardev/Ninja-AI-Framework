/**
 * @ninja/integrations-engram — retriever.ts
 * Recuperador de memoria con ranking inteligente.
 */

import { createLogger } from '@ninja/logging';
import type { MemoryEntry, MemoryQuery } from './schema.js';
import { EngramClient, engramClient } from './engram-client.js';

const log = createLogger('memory-retriever');

export interface RankingWeights {
  recency: number;
  tags: number;
}

const DEFAULT_WEIGHTS: RankingWeights = {
  recency: 0.6,
  tags: 0.4,
};

export class MemoryRetriever {
  private client: EngramClient;
  private weights: RankingWeights;

  constructor(client: EngramClient, weights?: Partial<RankingWeights>) {
    this.client = client;
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  async getRelevant(query: MemoryQuery, tokenBudget: number): Promise<MemoryEntry[]> {
    const result = await this.client.retrieve(query);
    if (!result.success) {
      log.warn('Failed to retrieve memories', {
        sessionId: query.sessionId,
        error: result.error.message,
      });
      return [];
    }

    let entries = result.data;

    if (query.tags && query.tags.length > 0) {
      entries = this.rankByCombined(entries, query.tags);
    } else {
      entries = this.rankByRecency(entries);
    }

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

    log.info('Relevant memories retrieved', {
      sessionId: query.sessionId,
      count: selected.length,
      tokensUsed,
    });

    return selected;
  }

  rankByRecency(entries: MemoryEntry[]): MemoryEntry[] {
    return [...entries].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    });
  }

  rankByTags(entries: MemoryEntry[], tags: string[]): MemoryEntry[] {
    return [...entries].sort((a, b) => {
      const scoreA = this.calculateTagScore(a, tags);
      const scoreB = this.calculateTagScore(b, tags);
      return scoreB - scoreA;
    });
  }

  private rankByCombined(entries: MemoryEntry[], tags: string[]): MemoryEntry[] {
    if (entries.length === 0) return entries;

    const timestamps = entries.map((e) => new Date(e.timestamp).getTime());
    const maxTimestamp = Math.max(...timestamps);
    const minTimestamp = Math.min(...timestamps);
    const timeRange = maxTimestamp - minTimestamp || 1;

    return [...entries].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();

      const recencyA = (timeA - minTimestamp) / timeRange;
      const recencyB = (timeB - minTimestamp) / timeRange;

      const tagScoreA = this.calculateTagScore(a, tags);
      const tagScoreB = this.calculateTagScore(b, tags);

      const scoreA = recencyA * this.weights.recency + tagScoreA * this.weights.tags;
      const scoreB = recencyB * this.weights.recency + tagScoreB * this.weights.tags;

      return scoreB - scoreA;
    });
  }

  private calculateTagScore(entry: MemoryEntry, queryTags: string[]): number {
    if (!entry.tags || entry.tags.length === 0) return 0;

    const matches = entry.tags.filter((t) => queryTags.includes(t)).length;
    return matches / queryTags.length;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

export const memoryRetriever = new MemoryRetriever(engramClient);
