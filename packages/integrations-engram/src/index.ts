/**
 * @ninja/integrations-engram — index.ts
 * Barrel de exportaciones públicas del paquete integrations-engram.
 * Capa WARM de memoria para conversaciones, decisiones y contexto de sesión.
 */

// Schema - Tipos públicos
export type {
  MemoryEntry,
  MemoryQuery,
  CompressionResult,
  MemoryStoredPayload,
  MemoryRetrievedPayload,
  MemoryDeletedPayload,
  TokenBudget,
  MemoryCompressedPayload,
  MemoryContextRetrievedPayload,
} from './schema.js';

// EngramClient - Cliente de memoria
export { EngramClient, engramClient } from './engram-client.js';

// MemoryManager - Gestor de contexto
export { MemoryManager, memoryManager } from './memory-manager.js';

// MemoryRetriever - Recuperador con ranking
export { MemoryRetriever, memoryRetriever } from './retriever.js';
export type { RankingWeights } from './retriever.js';

// MemoryCompressor - Compresor heurístico
export { MemoryCompressor, memoryCompressor } from './compressor.js';
