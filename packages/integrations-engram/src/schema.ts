/**
 * @ninja/integrations-engram — schema.ts
 * Tipos para la capa WARM de memoria (Engram).
 * Persiste conversaciones, decisiones y contexto de sesión con compresión diferencial.
 */

import type { ID, Timestamp } from '@ninja/contracts';

// ---------------------------------------------------------------------------
// Tipos de Memoria
// ---------------------------------------------------------------------------

/**
 * Entrada de memoria almacenada en Engram.
 */
export interface MemoryEntry {
  readonly id: ID;
  readonly sessionId: ID;
  readonly agentId?: ID;
  readonly content: string;
  readonly compressed: boolean;
  readonly tokenCount: number;
  readonly timestamp: Timestamp;
  readonly tags: string[];
}

/**
 * Query para buscar entradas de memoria.
 */
export interface MemoryQuery {
  readonly sessionId: ID;
  readonly agentId?: ID;
  readonly tags?: string[];
  readonly limit?: number;
  readonly fromTimestamp?: Timestamp;
}

/**
 * Resultado de compresión de contenido.
 */
export interface CompressionResult {
  readonly original: string;
  readonly compressed: string;
  readonly originalTokens: number;
  readonly compressedTokens: number;
  readonly ratio: number;
}

// ---------------------------------------------------------------------------
// Payloads de Eventos
// ---------------------------------------------------------------------------

/**
 * Payload emitido cuando se almacena una memoria.
 */
export interface MemoryStoredPayload {
  readonly id: ID;
  readonly sessionId: ID;
  readonly tokenCount: number;
}

/**
 * Payload emitido cuando se recuperan memorias.
 */
export interface MemoryRetrievedPayload {
  readonly sessionId: ID;
  readonly count: number;
}

/**
 * Payload emitido cuando se elimina una memoria.
 */
export interface MemoryDeletedPayload {
  readonly id: ID;
  readonly sessionId: ID;
}

// ---------------------------------------------------------------------------
// Token Budget
// ---------------------------------------------------------------------------

/**
 * Presupuesto de tokens para gestión de límites.
 */
export interface TokenBudget {
  readonly max: number;
  readonly used: number;
  readonly remaining: number;
}

// ---------------------------------------------------------------------------
// Payloads Adicionales
// ---------------------------------------------------------------------------

/**
 * Payload emitido cuando se comprimen memorias.
 */
export interface MemoryCompressedPayload {
  readonly sessionId: ID;
  readonly count: number;
}

/**
 * Payload emitido cuando se recupera contexto.
 */
export interface MemoryContextRetrievedPayload {
  readonly sessionId: ID;
  readonly agentId?: ID;
  readonly tokenBudget: number;
  readonly tokensUsed: number;
  readonly entriesCount: number;
}
