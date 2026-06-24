import type { MemoryLayer, VaultEntry } from '../schema.js';

export interface BudgetAllocation {
  layer: MemoryLayer;
  tokens: number;
  percentage: number;
}

export interface BudgetConfig {
  hotPercentage: number;
  warmPercentage: number;
  coldPercentage: number;
  anchorsPercentage: number;
}

export interface TrimResult {
  entries: VaultEntry[];
  totalTokens: number;
  trimmed: number;
  remaining: number;
}

const DEFAULT_CONFIG: BudgetConfig = {
  hotPercentage: 40,
  warmPercentage: 30,
  coldPercentage: 20,
  anchorsPercentage: 10,
};

const MIN_BUDGET_PER_LAYER = 100;
const MAX_ENTRY_BUDGET_RATIO = 0.5;

export class VaultBudgetManager {
  private config: BudgetConfig;

  constructor(config?: Partial<BudgetConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.normalizeConfig();
  }

  allocate(totalBudget: number, layers: MemoryLayer[]): Record<MemoryLayer, number> {
    if (totalBudget <= 0) {
      throw new Error('totalBudget must be positive');
    }
    if (!layers || layers.length === 0) {
      throw new Error('layers must contain at least one layer');
    }

    const allocation: Record<string, number> = {};
    const layerPercentages: Record<MemoryLayer, number> = {
      HOT: this.config.hotPercentage,
      WARM: this.config.warmPercentage,
      COLD: this.config.coldPercentage,
      ANCHORS: this.config.anchorsPercentage,
    };

    const requestedLayers = layers.filter((l) => layerPercentages[l] !== undefined);

    if (requestedLayers.length === 0) {
      throw new Error('No valid layers provided');
    }

    const totalRequested = requestedLayers.reduce((sum, l) => sum + layerPercentages[l], 0);

    for (const layer of requestedLayers) {
      const percentage = layerPercentages[layer] / totalRequested;
      allocation[layer] = Math.floor(totalBudget * percentage);
    }

    return allocation as Record<MemoryLayer, number>;
  }

  trim(entries: VaultEntry[], budget: number): VaultEntry[] {
    return this.trimWithDetails(entries, budget).entries;
  }

  trimWithDetails(entries: VaultEntry[], budget: number): TrimResult {
    if (budget <= 0) {
      return { entries: [], totalTokens: 0, trimmed: entries.length, remaining: 0 };
    }

    const selectedEntries: VaultEntry[] = [];
    let currentTokens = 0;
    let trimmed = 0;

    for (const entry of entries) {
      const entryTokens = this.estimateTokens(entry.content);

      if (entryTokens > budget * MAX_ENTRY_BUDGET_RATIO) {
        trimmed++;
        continue;
      }

      if (currentTokens + entryTokens <= budget) {
        selectedEntries.push(entry);
        currentTokens += entryTokens;
      } else {
        trimmed++;
      }
    }

    return {
      entries: selectedEntries,
      totalTokens: currentTokens,
      trimmed,
      remaining: budget - currentTokens,
    };
  }

  estimateTotalTokens(entries: VaultEntry[]): number {
    return entries.reduce((sum, e) => sum + this.estimateTokens(e.content), 0);
  }

  fitsBudget(entries: VaultEntry[], budget: number): boolean {
    return this.estimateTotalTokens(entries) <= budget;
  }

  getConfig(): BudgetConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<BudgetConfig>): void {
    this.config = { ...this.config, ...config };
    this.normalizeConfig();
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private normalizeConfig(): void {
    const total =
      this.config.hotPercentage +
      this.config.warmPercentage +
      this.config.coldPercentage +
      this.config.anchorsPercentage;

    if (Math.abs(total - 100) > 0.01) {
      const scale = 100 / total;
      this.config.hotPercentage = this.config.hotPercentage * scale;
      this.config.warmPercentage = this.config.warmPercentage * scale;
      this.config.coldPercentage = this.config.coldPercentage * scale;
      this.config.anchorsPercentage = this.config.anchorsPercentage * scale;
    }
  }
}
