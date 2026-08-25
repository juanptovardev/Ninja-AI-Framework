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
    // Real catalog IDs (verified against model-gateway/src/catalog.ts)
    // Chains ordered by: capability tier, cost, latency
    const defaultChains: Record<string, string[]> = {
      // OpenAI
      'openai/gpt-4o': ['openai/gpt-4o-mini', 'anthropic/claude-3-5-sonnet', 'deepseek/deepseek-v3'],
      'openai/gpt-4o-mini': ['anthropic/claude-3-haiku', 'google/gemini-2.0-flash', 'meta/llama-3.3-70b'],
      'openai/gpt-3.5-turbo': ['meta/llama-3.3-70b', 'ollama/llama3.1:8b'],
      // Anthropic
      'anthropic/claude-3-5-sonnet': ['openai/gpt-4o-mini', 'anthropic/claude-3-haiku'],
      'anthropic/claude-3-haiku': ['meta/llama-3.3-70b', 'google/gemini-2.0-flash'],
      // DeepSeek / Qwen
      'deepseek/deepseek-v3': ['openai/gpt-4o-mini', 'qwen/qwen3-235b'],
      'qwen/qwen3-235b': ['deepseek/deepseek-v3', 'anthropic/claude-3-haiku'],
      // Google
      'google/gemini-2.0-flash': ['openai/gpt-4o-mini', 'meta/llama-3.3-70b'],
      // Meta / Local (leaves — no fallback for free/local tier)
      'meta/llama-3.3-70b': ['ollama/llama3.1:8b'],
      'ollama/llama3.1:8b': [],
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

  /** Reset singleton — for testing only */
  static resetInstance(): void {
    FallbackChain.instance = null;
  }
}

export const fallbackChain = FallbackChain.getInstance();
