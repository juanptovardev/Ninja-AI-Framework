import type { ID, Timestamp } from '@ninja/contracts';

/**
 * Capas de memoria disponibles en el Vault
 */
export type MemoryLayer = 'HOT' | 'WARM' | 'COLD' | 'ANCHORS';

/**
 * Entrada individual de memoria con relevancia
 */
export interface VaultEntry {
  readonly content: string;
  readonly layer: MemoryLayer;
  readonly relevance: number;
  readonly timestamp: Timestamp;
  // Campos adicionales que pueden estar presentes en algunas entradas
  readonly id?: string;
  readonly agentId?: ID;
  readonly sessionId?: ID;
  readonly workspaceId?: ID;
  readonly tokens?: number;
  readonly isAnchor?: boolean;
  readonly lastAccess?: Timestamp;
}

/**
 * Interfaz para proveedor de memoria HOT (inyección de dependencia)
 */
export interface IHotMemoryProvider {
  getEntries(agentId: ID, sessionId: ID): Promise<VaultEntry[]>;
}

/**
 * Query para consulta multi-capa de Vault
 */
export interface VaultQuery {
  readonly agentId: ID;
  readonly sessionId: ID;
  readonly query: string;
  readonly layers: MemoryLayer[];
  readonly tokenBudget: number;
}

/**
 * Resultado de una capa específica de Vault
 */
export interface VaultResult {
  readonly entries: VaultEntry[];
  readonly layer: MemoryLayer;
  readonly totalTokens: number;
}

/**
 * Payload para evento de consulta ejecutada
 */
export interface VaultQueryExecutedPayload {
  readonly agentId: ID;
  readonly sessionId: ID;
  readonly layers: MemoryLayer[];
  readonly totalTokens: number;
  readonly duration: number;
}

/**
 * Payload para evento de escritura
 */
export interface VaultWritePayload {
  readonly agentId: ID;
  readonly sessionId: ID;
  readonly layer: MemoryLayer;
  readonly tokenCount: number;
}

/**
 * Payload para evento context.budget.exceeded
 */
export interface ContextBudgetExceededPayload {
  readonly agentId: ID;
  readonly sessionId: ID;
  readonly budget: number;
  readonly actualTokens: number;
  readonly trimmedCount: number;
  readonly remainingBudget: number;
}

/**
 * Payload para evento context.compressed
 */
export interface ContextCompressedPayload {
  readonly agentId: ID;
  readonly sessionId: ID;
  readonly workspaceId: ID;
  readonly originalTokens: number;
  readonly compressedTokens: number;
  readonly ratio: number;
  readonly layer: 'WARM' | 'COLD';
  readonly entriesProcessed: number;
}

/**
 * Payload para evento context.anchor.promoted
 */
export interface ContextAnchorPromotedPayload {
  readonly sessionId: ID;
  readonly workspaceId: ID;
  readonly anchorsCount: number;
  readonly anchorIds: ID[];
  readonly totalTokens: number;
}

/**
 * Resultado de compresión de contexto
 */
export interface CompressionResult {
  originalTokens: number;
  compressedTokens: number;
  ratio: number;
  layer: 'WARM' | 'COLD';
  entriesProcessed: number;
}
