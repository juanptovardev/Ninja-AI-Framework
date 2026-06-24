/**
 * @ninja/model-gateway — index.ts
 * Barrel de exportaciones públicas del paquete model-gateway.
 * Sistema de selección inteligente de modelos con gestión de presupuesto,
 * cadena de fallback y ping de disponibilidad.
 */

// Schema - Tipos públicos (Terminal A)
export type {
  ModelTier,
  ModelCapability,
  SelectionStrategy,
  ModelEntry,
  SelectionRequest,
  SelectionResult,
  ModelSelectedPayload,
  ModelGatewayExhaustedPayload,
} from './schema.js';

// Catalog - Registro de modelos (Terminal A)
export { ModelCatalog, modelCatalog } from './catalog.js';

// Selector - Lógica de selección (Terminal A)
export { ModelSelector, modelSelector, ModelSelectionError } from './selector.js';

// Strategy - Motor de estrategias (Terminal A)
export {
  StrategyEngine,
  createStrategyEngine,
  GatewayExhaustedError,
  DEFAULT_STRATEGY_MAP,
} from './strategy.js';
export type {
  GatewayResult,
  StrategyEngineDeps,
  GatewayRequest,
  StrategyResolvedPayload,
  GatewayFallbackPayload,
} from './strategy.js';

// Budget - Gestión de presupuesto (Terminal B - Turno 1)
export { BudgetManager, budgetManager } from './budget.js';
export type {
  ModelUsageStats,
  TokenUsageSummary,
  BudgetWarningPayload,
  BudgetExceededPayload,
} from './budget.js';

// Fallback - Cadena de fallback (Terminal B - Turno 2)
export { FallbackChain, fallbackChain } from './fallback.js';
export type {
  FallbackReason,
  FallbackTriggeredPayload,
  FallbackExhaustedPayload,
  FallbackChainConfig,
} from './fallback.js';

// Pinger - Ping de disponibilidad (Terminal B - Turno 3)
export { ModelPinger, modelPinger } from './pinger.js';
export type { PingResult, PingCompletedPayload } from './pinger.js';

// Benchmark - Puntajes de inteligencia (Terminal A - Turno 1)
export { BENCHMARK_SCORES } from './benchmark-registry.js';
