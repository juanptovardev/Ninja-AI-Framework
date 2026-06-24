import type { EventBus } from '@ninja/events';
import { eventBus as globalEventBus, createEvent } from '@ninja/events';
import type { TokenUsage } from '@ninja/integrations-llm';

export interface ModelUsageStats {
  promptTokens: number;
  completionTokens: number;
  requestCount: number;
}

export interface TokenUsageSummary {
  totalPrompt: number;
  totalCompletion: number;
  estimatedCost: number;
  modelBreakdown: Record<string, ModelUsageStats>;
}

export interface BudgetWarningPayload {
  sessionId: string;
  usage: number;
  limit: number;
  percentage: number;
}

export interface BudgetExceededPayload extends BudgetWarningPayload {}

interface PricingInfo {
  promptPer1k: number;
  completionPer1k: number;
}

interface SessionBudgetState {
  totalPrompt: number;
  totalCompletion: number;
  modelBreakdown: Map<string, ModelUsageStats>;
  warningEmitted: boolean;
  exceededEmitted: boolean;
  limitTokens?: number;
}

export class BudgetManager {
  private static instance: BudgetManager | null = null;
  private sessionData: Map<string, SessionBudgetState>;
  private eventBus: EventBus;
  private pricingTable: Map<string, PricingInfo>;

  private constructor(eventBus: EventBus) {
    this.sessionData = new Map();
    this.eventBus = eventBus;
    this.pricingTable = this.initializePricingTable();
  }

  private initializePricingTable(): Map<string, PricingInfo> {
    const table = new Map<string, PricingInfo>();

    table.set('gpt-4', { promptPer1k: 0.03, completionPer1k: 0.06 });
    table.set('gpt-4-turbo', { promptPer1k: 0.01, completionPer1k: 0.03 });
    table.set('gpt-3.5-turbo', { promptPer1k: 0.0015, completionPer1k: 0.002 });
    table.set('claude-3-opus', { promptPer1k: 0.015, completionPer1k: 0.075 });
    table.set('claude-3-sonnet', { promptPer1k: 0.003, completionPer1k: 0.015 });
    table.set('claude-3-haiku', { promptPer1k: 0.00025, completionPer1k: 0.00125 });

    return table;
  }

  private getOrCreateSessionState(sessionId: string): SessionBudgetState {
    let state = this.sessionData.get(sessionId);
    if (!state) {
      state = {
        totalPrompt: 0,
        totalCompletion: 0,
        modelBreakdown: new Map(),
        warningEmitted: false,
        exceededEmitted: false,
      };
      this.sessionData.set(sessionId, state);
    }
    return state;
  }

  private calculateCost(promptTokens: number, completionTokens: number, modelId: string): number {
    const pricing = this.pricingTable.get(modelId);
    if (!pricing) {
      return 0;
    }
    const promptCost = (promptTokens / 1000) * pricing.promptPer1k;
    const completionCost = (completionTokens / 1000) * pricing.completionPer1k;
    return promptCost + completionCost;
  }

  private updateModelStats(
    modelBreakdown: Map<string, ModelUsageStats>,
    modelId: string,
    promptTokens: number,
    completionTokens: number
  ): void {
    const stats = modelBreakdown.get(modelId) ?? {
      promptTokens: 0,
      completionTokens: 0,
      requestCount: 0,
    };
    stats.promptTokens += promptTokens;
    stats.completionTokens += completionTokens;
    stats.requestCount += 1;
    modelBreakdown.set(modelId, stats);
  }

  private checkBudgetThresholds(
    sessionId: string,
    state: SessionBudgetState,
    limitTokens: number
  ): void {
    const totalTokens = state.totalPrompt + state.totalCompletion;
    const percentage = (totalTokens / limitTokens) * 100;

    if (percentage >= 100 && !state.exceededEmitted) {
      state.exceededEmitted = true;
      const payload: BudgetExceededPayload = {
        sessionId,
        usage: totalTokens,
        limit: limitTokens,
        percentage,
      };
      const event = createEvent('model.budget.exceeded', 'model-gateway', payload);
      this.eventBus.emit(event);
    } else if (percentage >= 80 && !state.warningEmitted) {
      state.warningEmitted = true;
      const payload: BudgetWarningPayload = {
        sessionId,
        usage: totalTokens,
        limit: limitTokens,
        percentage,
      };
      const event = createEvent('model.budget.warning', 'model-gateway', payload);
      this.eventBus.emit(event);
    }
  }

  record(sessionId: string, modelId: string, usage: TokenUsage): void {
    const state = this.getOrCreateSessionState(sessionId);

    state.totalPrompt += usage.prompt_tokens;
    state.totalCompletion += usage.completion_tokens;

    this.updateModelStats(
      state.modelBreakdown,
      modelId,
      usage.prompt_tokens,
      usage.completion_tokens
    );

    if (state.limitTokens !== undefined && state.limitTokens > 0) {
      this.checkBudgetThresholds(sessionId, state, state.limitTokens);
    }
  }

  getSessionSummary(sessionId: string): TokenUsageSummary | undefined {
    const state = this.sessionData.get(sessionId);
    if (!state) {
      return undefined;
    }

    const modelBreakdown: Record<string, ModelUsageStats> = {};
    for (const [modelId, stats] of state.modelBreakdown.entries()) {
      modelBreakdown[modelId] = stats;
    }

    let estimatedCost = 0;
    for (const [modelId, stats] of state.modelBreakdown.entries()) {
      estimatedCost += this.calculateCost(stats.promptTokens, stats.completionTokens, modelId);
    }

    return {
      totalPrompt: state.totalPrompt,
      totalCompletion: state.totalCompletion,
      estimatedCost,
      modelBreakdown,
    };
  }

  getGlobalUsage(): TokenUsageSummary {
    const globalBreakdown: Record<string, ModelUsageStats> = {};
    let globalPrompt = 0;
    let globalCompletion = 0;
    let globalCost = 0;

    for (const state of this.sessionData.values()) {
      globalPrompt += state.totalPrompt;
      globalCompletion += state.totalCompletion;

      for (const [modelId, stats] of state.modelBreakdown.entries()) {
        const globalStats = globalBreakdown[modelId] ?? {
          promptTokens: 0,
          completionTokens: 0,
          requestCount: 0,
        };
        globalStats.promptTokens += stats.promptTokens;
        globalStats.completionTokens += stats.completionTokens;
        globalStats.requestCount += stats.requestCount;
        globalBreakdown[modelId] = globalStats;
      }
    }

    for (const [modelId, stats] of Object.entries(globalBreakdown)) {
      globalCost += this.calculateCost(stats.promptTokens, stats.completionTokens, modelId);
    }

    return {
      totalPrompt: globalPrompt,
      totalCompletion: globalCompletion,
      estimatedCost: globalCost,
      modelBreakdown: globalBreakdown,
    };
  }

  isOverBudget(sessionId: string, limitTokens: number): boolean {
    const state = this.sessionData.get(sessionId);
    if (!state) {
      return false;
    }
    const totalTokens = state.totalPrompt + state.totalCompletion;
    return totalTokens > limitTokens;
  }

  reset(sessionId: string): void {
    this.sessionData.delete(sessionId);
  }

  static getInstance(eventBus?: EventBus): BudgetManager {
    if (!BudgetManager.instance) {
      BudgetManager.instance = new BudgetManager(eventBus ?? globalEventBus);
    }
    return BudgetManager.instance;
  }

  static resetInstance(): void {
    BudgetManager.instance = null;
  }

  setSessionBudget(sessionId: string, limitTokens: number): void {
    const state = this.getOrCreateSessionState(sessionId);
    state.limitTokens = limitTokens;
  }
}

export const budgetManager = BudgetManager.getInstance();
