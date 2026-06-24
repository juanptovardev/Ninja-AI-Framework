/**
 * @ninja/model-gateway — strategy.ts
 * Motor de estrategias que orquesta la selección de modelos.
 *
 * Responsabilidades:
 * - Mapear capabilities a estrategias de selección
 * - Integrar selector, catalog y budget
 * - Emitir eventos de métricas
 * - Garantizar fallback a modelos gratuitos
 */

import type { Result } from '@ninja/contracts';
import { ok, err } from '@ninja/contracts';
import { eventBus, createEvent } from '@ninja/events';
import type { ModelSelector } from './selector.js';
import type { ModelCatalog } from './catalog.js';
import type { BudgetManager } from './budget.js';
import type {
  ModelEntry,
  ModelCapability,
  SelectionStrategy,
  SelectionRequest,
  ModelSelectedPayload,
  ModelGatewayExhaustedPayload,
} from './schema.js';

// ---------------------------------------------------------------------------
// Mapeo por defecto
// ---------------------------------------------------------------------------

export const DEFAULT_STRATEGY_MAP: Record<ModelCapability, SelectionStrategy> = {
  code: 'most-capable',
  reasoning: 'most-capable',
  chat: 'balanced',
  vision: 'most-capable',
  embedding: 'cheapest',
};

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface GatewayResult {
  readonly model: ModelEntry;
  readonly strategy: SelectionStrategy;
  readonly budgetCheckPassed: boolean;
  readonly fallbackUsed: boolean;
  readonly confidence: number;
}

export class GatewayExhaustedError extends Error {
  readonly code = 'GATEWAY_EXHAUSTED' as const;
  readonly capability: ModelCapability;
  readonly reason: string;

  constructor(capability: ModelCapability, reason: string) {
    super(`Gateway exhausted for capability "${capability}": ${reason}`);
    this.capability = capability;
    this.reason = reason;
    Object.setPrototypeOf(this, GatewayExhaustedError.prototype);
  }
}

export interface StrategyEngineDeps {
  selector: ModelSelector;
  catalog: ModelCatalog;
  budget: BudgetManager;
  eventBus?: typeof eventBus;
}

export interface GatewayRequest {
  capability: ModelCapability;
  taskContext?: string;
  sessionId: string;
  budgetLimit: number;
}

export interface StrategyResolvedPayload {
  capability: ModelCapability;
  strategy: SelectionStrategy;
  source: 'default' | 'runtime' | 'fallback';
}

export interface GatewayFallbackPayload {
  originalCapability: ModelCapability;
  fallbackModel: string;
  reason: 'budget-exceeded' | 'no-capability-match' | 'quota-exhausted';
}

// ---------------------------------------------------------------------------
// StrategyEngine
// ---------------------------------------------------------------------------

export class StrategyEngine {
  private capabilityStrategyMap: Map<ModelCapability, SelectionStrategy>;
  private readonly deps: StrategyEngineDeps;
  private readonly _eventBus: typeof eventBus;

  constructor(
    deps: StrategyEngineDeps,
    customMapping?: Partial<Record<ModelCapability, SelectionStrategy>>
  ) {
    this.deps = deps;
    this._eventBus = deps.eventBus ?? eventBus;

    // Inicializar mapeo
    this.capabilityStrategyMap = new Map(
      Object.entries(DEFAULT_STRATEGY_MAP) as [ModelCapability, SelectionStrategy][]
    );

    // Aplicar overrides
    if (customMapping) {
      Object.entries(customMapping).forEach(([cap, strat]) => {
        this.capabilityStrategyMap.set(cap as ModelCapability, strat);
      });
    }
  }

  /**
   * Obtiene la estrategia configurada para una capability.
   */
  getStrategyForTask(capability: ModelCapability): SelectionStrategy {
    return this.capabilityStrategyMap.get(capability) ?? 'balanced';
  }

  /**
   * Actualiza la estrategia para una capability en runtime.
   */
  setStrategyForCapability(capability: ModelCapability, strategy: SelectionStrategy): void {
    const previous = this.capabilityStrategyMap.get(capability);
    this.capabilityStrategyMap.set(capability, strategy);

    const evt = createEvent('model.strategy.changed', 'model-gateway', {
      capability,
      previous,
      new: strategy,
    });
    this._eventBus.emit(evt);
  }

  /**
   * Orquestación principal: integra selector, catalog y budget.
   * Garantiza retorno de modelo o error tipado.
   */
  integrate(request: GatewayRequest): Result<GatewayResult, GatewayExhaustedError> {
    const startTime = Date.now();

    // 1. Verificar presupuesto
    if (this.deps.budget.isOverBudget(request.sessionId, request.budgetLimit)) {
      return this.handleBudgetExceeded(request, startTime);
    }

    // 2. Determinar estrategia
    const strategy = this.getStrategyForTask(request.capability);
    this.emitStrategyResolved(request.capability, strategy, 'default');

    // 3. Seleccionar modelo
    const selectionRequest: SelectionRequest = {
      capability: request.capability,
      strategy,
      taskContext: request.taskContext,
    };

    const selectionResult = this.deps.selector.select(selectionRequest);

    if (!selectionResult.success) {
      return this.handleSelectionFailed(request, strategy, startTime);
    }

    // 4. Validar presupuesto
    const budgetCheckPassed = this.validateBudgetForModel(request);

    // 5. Obtener modelo
    const model = this.deps.catalog.getById(selectionResult.data.modelId);
    if (!model) {
      return this.handleSelectionFailed(request, strategy, startTime);
    }

    // 6. Emitir métricas
    this.emitSelectionMetrics(request, strategy, model, startTime, false);

    return ok({
      model,
      strategy,
      budgetCheckPassed,
      fallbackUsed: false,
      confidence: selectionResult.data.confidence,
    });
  }

  /**
   * Obtiene todas las estrategias configuradas.
   */
  getAllStrategies(): Record<ModelCapability, SelectionStrategy> {
    return Object.fromEntries(this.capabilityStrategyMap) as Record<
      ModelCapability,
      SelectionStrategy
    >;
  }

  // ---------------------------------------------------------------------------
  // Métodos Privados
  // ---------------------------------------------------------------------------

  private handleBudgetExceeded(
    request: GatewayRequest,
    startTime: number
  ): Result<GatewayResult, GatewayExhaustedError> {
    // Fallback: buscar modelo gratuito con la capability requerida
    const freeModels = this.deps.catalog
      .getAvailable()
      .filter((m) => m.tier === 'free' && m.capabilities.includes(request.capability));

    if (freeModels.length > 0) {
      const fallbackModel = freeModels[0];
      this.emitFallbackEvent(request.capability, fallbackModel.id, 'budget-exceeded');
      this.emitSelectionMetrics(request, 'cheapest', fallbackModel, startTime, true);

      return ok({
        model: fallbackModel,
        strategy: 'cheapest',
        budgetCheckPassed: false,
        fallbackUsed: true,
        confidence: 0.7,
      });
    }

    // Último recurso: cualquier modelo gratuito
    const anyFreeModel = this.deps.catalog.getAvailable().find((m) => m.tier === 'free');
    if (anyFreeModel) {
      this.emitFallbackEvent(request.capability, anyFreeModel.id, 'budget-exceeded');
      this.emitSelectionMetrics(request, 'cheapest', anyFreeModel, startTime, true);

      return ok({
        model: anyFreeModel,
        strategy: 'cheapest',
        budgetCheckPassed: false,
        fallbackUsed: true,
        confidence: 0.5,
      });
    }

    return err(
      new GatewayExhaustedError(request.capability, 'No free models available for fallback')
    );
  }

  private handleSelectionFailed(
    request: GatewayRequest,
    strategy: SelectionStrategy,
    startTime: number
  ): Result<GatewayResult, GatewayExhaustedError> {
    // Fallback: modelo gratuito con la capability
    const freeModels = this.deps.catalog
      .getAvailable()
      .filter((m) => m.tier === 'free' && m.capabilities.includes(request.capability));

    if (freeModels.length > 0) {
      const fallbackModel = freeModels[0];
      this.emitFallbackEvent(request.capability, fallbackModel.id, 'no-capability-match');
      this.emitSelectionMetrics(request, strategy, fallbackModel, startTime, true);

      return ok({
        model: fallbackModel,
        strategy: 'cheapest',
        budgetCheckPassed: true,
        fallbackUsed: true,
        confidence: 0.6,
      });
    }

    // Último recurso: cualquier modelo gratuito
    const anyFreeModel = this.deps.catalog.getAvailable().find((m) => m.tier === 'free');
    if (anyFreeModel) {
      this.emitFallbackEvent(request.capability, anyFreeModel.id, 'no-capability-match');
      this.emitSelectionMetrics(request, strategy, anyFreeModel, startTime, true);

      return ok({
        model: anyFreeModel,
        strategy: 'cheapest',
        budgetCheckPassed: true,
        fallbackUsed: true,
        confidence: 0.5,
      });
    }

    return err(new GatewayExhaustedError(request.capability, 'No models available for fallback'));
  }

  private validateBudgetForModel(request: GatewayRequest): boolean {
    const summary = this.deps.budget.getSessionSummary(request.sessionId);
    if (!summary) return true;
    return summary.estimatedCost < request.budgetLimit;
  }

  private emitStrategyResolved(
    capability: ModelCapability,
    strategy: SelectionStrategy,
    source: StrategyResolvedPayload['source']
  ): void {
    const evt = createEvent('model.strategy.resolved', 'model-gateway', {
      capability,
      strategy,
      source,
    } as StrategyResolvedPayload);
    this._eventBus.emit(evt);
  }

  private emitFallbackEvent(
    originalCapability: ModelCapability,
    fallbackModel: string,
    reason: GatewayFallbackPayload['reason']
  ): void {
    const evt = createEvent('model.gateway.fallback', 'model-gateway', {
      originalCapability,
      fallbackModel,
      reason,
    } as GatewayFallbackPayload);
    this._eventBus.emit(evt);
  }

  private emitSelectionMetrics(
    request: GatewayRequest,
    strategy: SelectionStrategy,
    model: ModelEntry,
    startTime: number,
    wasFallback: boolean
  ): void {
    const duration = Date.now() - startTime;
    const evt = createEvent('model.selection.metrics', 'model-gateway', {
      capability: request.capability,
      strategy,
      modelId: model.id,
      provider: model.provider,
      duration,
      wasFallback,
      sessionId: request.sessionId,
    });
    this._eventBus.emit(evt);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createStrategyEngine(
  deps: StrategyEngineDeps,
  customMapping?: Partial<Record<ModelCapability, SelectionStrategy>>
): StrategyEngine {
  return new StrategyEngine(deps, customMapping);
}
