/**
 * @ninja/model-gateway — schema.ts
 * Tipos principales del sistema de selección de modelos.
 */

// ---------------------------------------------------------------------------
// Tier del modelo
// ---------------------------------------------------------------------------

export type ModelTier = 'free' | 'paid' | 'local';

// ---------------------------------------------------------------------------
// Capacidades declaradas
// ---------------------------------------------------------------------------

export type ModelCapability = 'code' | 'reasoning' | 'chat' | 'vision' | 'embedding';

// ---------------------------------------------------------------------------
// Estrategia de selección
// ---------------------------------------------------------------------------

export type SelectionStrategy = 'fastest' | 'cheapest' | 'most-capable' | 'balanced' | 'premium' | 'high-efficiency';

// ---------------------------------------------------------------------------
// Entrada del catálogo
// ---------------------------------------------------------------------------

export interface ModelEntry {
  readonly id: string;
  readonly provider: string;
  readonly name: string;
  readonly tier: ModelTier;
  readonly contextWindow: number;
  readonly capabilities: ModelCapability[];
  readonly costPerToken?: number;
  readonly intelligenceScore?: number;
  isAvailable: boolean;
  quotaRemaining?: number;
  lastPing?: number;
}

// ---------------------------------------------------------------------------
// Request de selección
// ---------------------------------------------------------------------------

export interface SelectionRequest {
  readonly capability: ModelCapability;
  readonly strategy: SelectionStrategy;
  readonly taskContext?: string;
}

// ---------------------------------------------------------------------------
// Resultado de selección
// ---------------------------------------------------------------------------

export interface SelectionResult {
  readonly modelId: string;
  readonly providerId: string;
  readonly reason: string;
  readonly confidence: number;
  readonly apiKey?: string;
}

// ---------------------------------------------------------------------------
// Payloads de eventos
// ---------------------------------------------------------------------------

export interface ModelSelectedPayload {
  readonly modelId: string;
  readonly strategy: SelectionStrategy;
  readonly confidence: number;
  readonly apiKey?: string;
}

export interface ModelGatewayExhaustedPayload {
  readonly capability: ModelCapability;
  readonly reason: string;
  readonly availableCount: number;
}
