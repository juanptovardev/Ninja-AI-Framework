/**
 * @ninja/model-gateway — selector.ts
 * Lógica de selección inteligente de modelos.
 */

import type { Result } from '@ninja/contracts';
import { ok, err } from '@ninja/contracts';
import { eventBus, createEvent } from '@ninja/events';
import type { EventBusLike } from '@ninja/events';
import type {
  ModelEntry,
  ModelCapability,
  SelectionRequest,
  SelectionResult,
  SelectionStrategy,
  ModelSelectedPayload,
  ModelGatewayExhaustedPayload,
} from './schema.js';
import type { ModelCatalog } from './catalog.js';
import { modelCatalog } from './catalog.js';

// ---------------------------------------------------------------------------
// Error tipado
// ---------------------------------------------------------------------------

export class ModelSelectionError extends Error {
  readonly code: 'NO_MODELS_AVAILABLE' | 'NO_CAPABILITY_MATCH' | 'QUOTA_EXHAUSTED';
  readonly capability: ModelCapability;
  readonly availableCount: number;

  constructor(
    code: ModelSelectionError['code'],
    capability: ModelCapability,
    availableCount: number
  ) {
    super(`Model selection failed: ${code} for capability "${capability}"`);
    this.code = code;
    this.capability = capability;
    this.availableCount = availableCount;
    Object.setPrototypeOf(this, ModelSelectionError.prototype);
  }
}

/**
 * Vista estructural del catálogo que usa el selector.
 * Permite inyectar mocks sin acoplarse a la clase concreta.
 */
export type ModelCatalogLike = Pick<
  ModelCatalog,
  'getByCapability' | 'filterByAvailableKeys' | 'getApiKeys'
>;

// ---------------------------------------------------------------------------
// KeyRotator
// ---------------------------------------------------------------------------

export class KeyRotator {
  private indices = new Map<string, number>();

  constructor(private catalog: ModelCatalogLike) {}

  getNextKey(provider: string): string | undefined {
    if (provider === 'ollama') return undefined; // Local doesn't need key
    const keys = this.catalog.getApiKeys(provider);
    if (!keys || keys.length === 0) return undefined;

    const currentIndex = this.indices.get(provider) || 0;
    const key = keys[currentIndex];
    this.indices.set(provider, (currentIndex + 1) % keys.length);
    return key;
  }
}

// ---------------------------------------------------------------------------
// ModelSelector
// ---------------------------------------------------------------------------

export class ModelSelector {
  private catalog: ModelCatalogLike;
  private eventBus: EventBusLike;
  private rotator: KeyRotator;

  constructor(catalog?: ModelCatalogLike, eventBusInstance?: EventBusLike) {
    this.catalog = catalog ?? modelCatalog;
    this.eventBus = eventBusInstance ?? eventBus;
    this.rotator = new KeyRotator(this.catalog);
  }

  select(request: SelectionRequest): Result<SelectionResult, ModelSelectionError> {
    const byCapability = this.catalog.getByCapability(request.capability);

    if (byCapability.length === 0) {
      this.emitExhausted(request.capability, 'NO_CAPABILITY_MATCH', 0);
      return err(new ModelSelectionError('NO_CAPABILITY_MATCH', request.capability, 0));
    }

    const availableKeysIds = new Set(this.catalog.filterByAvailableKeys().map((m) => m.id));
    const available = byCapability.filter((m) => m.isAvailable && availableKeysIds.has(m.id));

    if (available.length === 0) {
      this.emitExhausted(request.capability, 'NO_MODELS_AVAILABLE', byCapability.length);
      return err(new ModelSelectionError('NO_MODELS_AVAILABLE', request.capability, 0));
    }

    const withQuota = available.filter(
      (m) => m.quotaRemaining === undefined || m.quotaRemaining > 0
    );

    if (withQuota.length === 0) {
      this.emitExhausted(request.capability, 'QUOTA_EXHAUSTED', available.length);
      return err(new ModelSelectionError('QUOTA_EXHAUSTED', request.capability, 0));
    }

    const selected = this.applyStrategy(withQuota, request.strategy);
    const confidence = this.calculateConfidence(withQuota, selected);
    const apiKey = this.rotator.getNextKey(selected.provider);
    this.emitSelected(selected.id, request.strategy, confidence, apiKey);

    return ok({
      modelId: selected.id,
      providerId: selected.provider,
      reason: `Selected by strategy: ${request.strategy}`,
      confidence,
      apiKey,
    });
  }

  private applyStrategy(models: ModelEntry[], strategy: SelectionStrategy): ModelEntry {
    switch (strategy) {
      case 'fastest':
        return this.selectFastest(models);
      case 'cheapest':
        return this.selectCheapest(models);
      case 'most-capable':
        return this.selectMostCapable(models);
      case 'balanced':
        return this.selectBalanced(models);
      case 'premium':
        return this.selectPremium(models);
      case 'high-efficiency':
        return this.selectHighEfficiency(models);
      default:
        return models[0];
    }
  }

  private selectFastest(models: ModelEntry[]): ModelEntry {
    return models.reduce((best, current) => {
      // WP-B9: "fastest" = menor ping. Sin ping medido => Infinity (no se prioriza como rápido).
      const bestPing = best.lastPing ?? Infinity;
      const currentPing = current.lastPing ?? Infinity;
      return currentPing < bestPing ? current : best;
    });
  }

  private selectCheapest(models: ModelEntry[]): ModelEntry {
    return models.reduce((best, current) => {
      const bestCost = best.costPerToken ?? Infinity;
      const currentCost = current.costPerToken ?? Infinity;
      return currentCost < bestCost ? current : best;
    });
  }

  private selectMostCapable(models: ModelEntry[]): ModelEntry {
    return models.reduce((best, current) => {
      const bestScore = best.contextWindow + best.capabilities.length * 10000;
      const currentScore = current.contextWindow + current.capabilities.length * 10000;
      return currentScore > bestScore ? current : best;
    });
  }

  private selectBalanced(models: ModelEntry[]): ModelEntry {
    return models.reduce((best, current) => {
      const bestScore = this.calculateBalancedScore(best);
      const currentScore = this.calculateBalancedScore(current);
      return currentScore > bestScore ? current : best;
    });
  }

  private selectPremium(models: ModelEntry[]): ModelEntry {
    return models.reduce((best, current) => {
      const bestScore = best.intelligenceScore ?? 0;
      const currentScore = current.intelligenceScore ?? 0;
      return currentScore > bestScore ? current : best;
    });
  }

  private selectHighEfficiency(models: ModelEntry[]): ModelEntry {
    return models.reduce((best, current) => {
      const bestRatio = best.contextWindow / Math.max(best.lastPing ?? 1, 1);
      const currentRatio = current.contextWindow / Math.max(current.lastPing ?? 1, 1);
      return currentRatio > bestRatio ? current : best;
    });
  }

  private calculateBalancedScore(model: ModelEntry): number {
    const costScore = 1 - (model.costPerToken ?? 0.00001) * 100000;
    const latencyScore = ((model.lastPing ?? Date.now()) % 10000) / 10000;
    const capabilityScore = model.capabilities.length * 0.1;
    const contextScore = Math.log10(model.contextWindow) * 0.3;
    return costScore * 0.3 + latencyScore * 0.3 + capabilityScore * 0.2 + contextScore * 0.2;
  }

  private calculateConfidence(models: ModelEntry[], winner: ModelEntry): number {
    const baseConfidence = 0.7;
    const availabilityBonus = Math.min(models.length / 10, 0.3);
    return Math.min(baseConfidence + availabilityBonus, 1.0);
  }

  private emitSelected(
    modelId: string,
    strategy: SelectionStrategy,
    confidence: number,
    apiKey?: string
  ): void {
    const payload: ModelSelectedPayload = { modelId, strategy, confidence, apiKey };
    const event = createEvent('model.selected', 'model-gateway', payload);
    this.eventBus.emit(event);
  }

  private emitExhausted(capability: ModelCapability, reason: string, availableCount: number): void {
    const payload: ModelGatewayExhaustedPayload = { capability, reason, availableCount };
    const event = createEvent('model.gateway.exhausted', 'model-gateway', payload);
    this.eventBus.emit(event);
  }
}

export const modelSelector = new ModelSelector();
