import type { EventBus } from '@ninja/events';
import { eventBus as globalEventBus, createEvent } from '@ninja/events';

export type FallbackReason =
  | 'rate_limit'
  | 'server_error'
  | 'quota_exceeded'
  | 'timeout'
  | 'model_unavailable';

export interface FallbackTriggeredPayload {
  from: string;
  to: string;
  reason: FallbackReason;
  sessionId?: string;
  timestamp: string;
}

export interface FallbackExhaustedPayload {
  originalModel: string;
  exhaustedChain: string[];
  reason: FallbackReason;
  sessionId?: string;
}

export interface FallbackChainConfig {
  primaryModel: string;
  fallbacks: string[];
}

interface SessionFallbackState {
  currentModel: string;
  exhaustedInSession: Set<string>;
}

export class FallbackChain {
  private static instance: FallbackChain | null = null;
  private chains: Map<string, string[]>;
  private sessionStates: Map<string, SessionFallbackState>;
  private eventBus: EventBus;

  private constructor(eventBus: EventBus) {
    this.chains = new Map();
    this.sessionStates = new Map();
    this.eventBus = eventBus;
    this.buildDefaultChains();
  }

  private buildDefaultChains(): void {
    const defaultChains: Record<string, string[]> = {
      'gpt-4': ['gpt-4-turbo', 'gpt-3.5-turbo', 'claude-3-haiku'],
      'gpt-4-turbo': ['gpt-3.5-turbo', 'claude-3-haiku'],
      'claude-3-opus': ['claude-3-sonnet', 'claude-3-haiku', 'gpt-3.5-turbo'],
      'claude-3-sonnet': ['claude-3-haiku', 'gpt-3.5-turbo'],
      'gpt-3.5-turbo': ['claude-3-haiku'],
      'claude-3-haiku': [],
    };

    for (const [primaryModel, fallbacks] of Object.entries(defaultChains)) {
      this.chains.set(primaryModel, fallbacks);
    }
  }

  private getOrCreateSessionState(sessionId: string): SessionFallbackState {
    let state = this.sessionStates.get(sessionId);
    if (!state) {
      state = {
        currentModel: '',
        exhaustedInSession: new Set(),
      };
      this.sessionStates.set(sessionId, state);
    }
    return state;
  }

  private emitFallbackTriggered(
    from: string,
    to: string,
    reason: FallbackReason,
    sessionId?: string
  ): void {
    const payload: FallbackTriggeredPayload = {
      from,
      to,
      reason,
      sessionId,
      timestamp: new Date().toISOString(),
    };
    const event = createEvent('model.fallback.triggered', 'model-gateway', payload);
    this.eventBus.emit(event);
  }

  private emitFallbackExhausted(
    originalModel: string,
    exhaustedChain: string[],
    reason: FallbackReason,
    sessionId?: string
  ): void {
    const payload: FallbackExhaustedPayload = {
      originalModel,
      exhaustedChain,
      reason,
      sessionId,
    };
    const event = createEvent('model.gateway.exhausted', 'model-gateway', payload);
    this.eventBus.emit(event);
  }

  getNext(failedModelId: string, reason: FallbackReason, sessionId?: string): string | null {
    const chain = this.chains.get(failedModelId);
    if (!chain || chain.length === 0) {
      this.emitFallbackExhausted(failedModelId, [], reason, sessionId);
      return null;
    }

    let sessionState: SessionFallbackState | undefined;
    if (sessionId) {
      sessionState = this.getOrCreateSessionState(sessionId);
      sessionState.exhaustedInSession.add(failedModelId);
    }

    const availableFallbacks = sessionState
      ? chain.filter((model) => !sessionState.exhaustedInSession.has(model))
      : chain;

    if (availableFallbacks.length === 0) {
      this.emitFallbackExhausted(failedModelId, chain, reason, sessionId);
      return null;
    }

    const nextModel = availableFallbacks[0];
    this.emitFallbackTriggered(failedModelId, nextModel, reason, sessionId);

    if (sessionState) {
      sessionState.currentModel = nextModel;
    }

    return nextModel;
  }

  setChain(primaryModel: string, fallbacks: string[]): void {
    this.chains.set(primaryModel, fallbacks);
  }

  hasFallback(modelId: string): boolean {
    const chain = this.chains.get(modelId);
    return chain !== undefined && chain.length > 0;
  }

  resetChainForSession(modelId: string, sessionId: string): void {
    const state = this.sessionStates.get(sessionId);
    if (state) {
      state.exhaustedInSession.delete(modelId);
    }
  }

  resetSession(sessionId: string): void {
    this.sessionStates.delete(sessionId);
  }

  getChain(modelId: string): string[] | undefined {
    return this.chains.get(modelId);
  }

  getAllChains(): Map<string, string[]> {
    return new Map(this.chains);
  }

  static getInstance(eventBus?: EventBus): FallbackChain {
    if (!FallbackChain.instance) {
      FallbackChain.instance = new FallbackChain(eventBus ?? globalEventBus);
    }
    return FallbackChain.instance;
  }
}

export const fallbackChain = FallbackChain.getInstance();
