/**
 * @ninja/model-gateway — catalog.ts
 * Registro de modelos disponibles.
 */

import type { ModelEntry, ModelCapability } from './schema.js';
import { resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

import { BENCHMARK_SCORES } from './benchmark-registry.js';

// ---------------------------------------------------------------------------
// Modelos por defecto
// ---------------------------------------------------------------------------

const DEFAULT_MODELS: ModelEntry[] = [
  {
    id: 'openai/gpt-4o',
    provider: 'openai',
    name: 'GPT-4o',
    tier: 'paid',
    contextWindow: 128000,
    capabilities: ['code', 'reasoning', 'chat', 'vision'],
    costPerToken: 0.0000025,
    intelligenceScore: BENCHMARK_SCORES['openai/gpt-4o'],
    isAvailable: true,
    quotaRemaining: 1000000,
    lastPing: Date.now(),
  },
  {
    id: 'openai/gpt-4o-mini',
    provider: 'openai',
    name: 'GPT-4o Mini',
    tier: 'paid',
    contextWindow: 128000,
    capabilities: ['code', 'chat'],
    costPerToken: 0.00000015,
    intelligenceScore: 80,
    isAvailable: true,
    quotaRemaining: 2000000,
    lastPing: Date.now(),
  },
  {
    id: 'anthropic/claude-3-5-sonnet',
    provider: 'anthropic',
    name: 'Claude 3.5 Sonnet',
    tier: 'paid',
    contextWindow: 200000,
    capabilities: ['code', 'reasoning', 'chat', 'vision'],
    costPerToken: 0.000003,
    intelligenceScore: BENCHMARK_SCORES['anthropic/claude-3-5-sonnet'],
    isAvailable: true,
    quotaRemaining: 1000000,
    lastPing: Date.now(),
  },
  {
    id: 'anthropic/claude-3-haiku',
    provider: 'anthropic',
    name: 'Claude 3 Haiku',
    tier: 'paid',
    contextWindow: 200000,
    capabilities: ['code', 'chat'],
    costPerToken: 0.00000025,
    intelligenceScore: 82,
    isAvailable: true,
    quotaRemaining: 2000000,
    lastPing: Date.now(),
  },
  {
    id: 'qwen/qwen3-235b',
    provider: 'qwen',
    name: 'Qwen3 235B',
    tier: 'paid',
    contextWindow: 131072,
    capabilities: ['code', 'reasoning'],
    costPerToken: 0.000001,
    intelligenceScore: 88,
    isAvailable: true,
    quotaRemaining: 500000,
    lastPing: Date.now(),
  },
  {
    id: 'deepseek/deepseek-v3',
    provider: 'deepseek',
    name: 'DeepSeek V3',
    tier: 'paid',
    contextWindow: 128000,
    capabilities: ['code', 'reasoning'],
    costPerToken: 0.0000005,
    intelligenceScore: 92,
    isAvailable: true,
    quotaRemaining: 1000000,
    lastPing: Date.now(),
  },
  {
    id: 'meta/llama-3.3-70b',
    provider: 'meta',
    name: 'Llama 3.3 70B',
    tier: 'free',
    contextWindow: 128000,
    capabilities: ['code', 'chat'],
    costPerToken: 0,
    intelligenceScore: 84,
    isAvailable: true,
    quotaRemaining: Infinity,
    lastPing: Date.now(),
  },
  {
    id: 'google/gemini-2.0-flash',
    provider: 'google',
    name: 'Gemini 2.0 Flash',
    tier: 'paid',
    contextWindow: 1000000,
    capabilities: ['code', 'chat', 'vision'],
    costPerToken: 0.0000001,
    intelligenceScore: BENCHMARK_SCORES['google/gemini-2.0-flash'],
    isAvailable: true,
    quotaRemaining: 2000000,
    lastPing: Date.now(),
  },
  {
    id: 'openai/gpt-3.5-turbo',
    provider: 'openai',
    name: 'GPT-3.5 Turbo',
    tier: 'free',
    contextWindow: 16385,
    capabilities: ['chat'],
    costPerToken: 0,
    intelligenceScore: 70,
    isAvailable: true,
    quotaRemaining: Infinity,
    lastPing: Date.now(),
  },
  {
    id: 'ollama/llama3.1:8b',
    provider: 'ollama',
    name: 'Llama 3.1 8B (Local)',
    tier: 'local',
    contextWindow: 128000,
    capabilities: ['code', 'chat'],
    costPerToken: 0,
    intelligenceScore: 60,
    isAvailable: true,
    quotaRemaining: Infinity,
    lastPing: Date.now(),
  },
];

// ---------------------------------------------------------------------------
// ModelCatalog
// ---------------------------------------------------------------------------

export class ModelCatalog {
  private models: Map<string, ModelEntry>;
  private configPath: string;
  private apiKeys: Map<string, string[]>;

  private static instance: ModelCatalog | null = null;

  private constructor() {
    this.models = new Map();
    this.apiKeys = new Map();
    this.configPath = resolve(homedir(), '.ninja', 'model-catalog.json');
    this.load();
    this.loadApiKeys();
  }

  static getInstance(): ModelCatalog {
    if (!ModelCatalog.instance) {
      ModelCatalog.instance = new ModelCatalog();
    }
    return ModelCatalog.instance;
  }

  register(model: ModelEntry): void {
    this.models.set(model.id, model);
    this.persist();
  }

  getAvailable(): ModelEntry[] {
    return Array.from(this.models.values()).filter((m) => m.isAvailable);
  }

  getApiKeys(provider: string): string[] {
    return this.apiKeys.get(provider) || [];
  }

  filterByAvailableKeys(): ModelEntry[] {
    return this.getAvailable().filter(m => {
      if (m.provider === 'ollama') return true;
      const keys = this.apiKeys.get(m.provider);
      return keys && keys.length > 0;
    });
  }

  getByCapability(cap: ModelCapability): ModelEntry[] {
    return this.getAvailable().filter((m) => m.capabilities.includes(cap));
  }

  getById(id: string): ModelEntry | undefined {
    return this.models.get(id);
  }

  updateAvailability(id: string, available: boolean): void {
    const model = this.models.get(id);
    if (model) {
      model.isAvailable = available;
      this.persist();
    }
  }

  updateQuota(id: string, remaining: number): void {
    const model = this.models.get(id);
    if (model) {
      model.quotaRemaining = remaining;
      this.persist();
    }
  }

  getAll(): ModelEntry[] {
    return Array.from(this.models.values());
  }

  private loadApiKeys(): void {
    this.apiKeys.clear();
    for (const [key, value] of Object.entries(process.env)) {
      if (!value) continue;
      
      const match = key.match(/^([A-Z0-9]+)_API_KEY(?:_\d+)?$/);
      if (match) {
        const provider = match[1].toLowerCase();
        const keys = this.apiKeys.get(provider) || [];
        keys.push(value);
        this.apiKeys.set(provider, keys);
      }
    }
  }

  private load(): void {
    try {
      if (existsSync(this.configPath)) {
        const raw = readFileSync(this.configPath, 'utf-8');
        const data = JSON.parse(raw) as ModelEntry[];
        this.models = new Map(data.map((m) => [m.id, m]));
        return;
      }
    } catch (error) {
      // Fall through to defaults
    }

    DEFAULT_MODELS.forEach((m) => this.models.set(m.id, { ...m }));
    this.persist();
  }

  private persist(): void {
    try {
      const dir = resolve(homedir(), '.ninja');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const data = JSON.stringify(Array.from(this.models.values()), null, 2);
      writeFileSync(this.configPath, data, 'utf-8');
    } catch (error) {
      // Silenciar errores de persistencia
    }
  }

  static resetInstance(): void {
    ModelCatalog.instance = null;
  }
}

export const modelCatalog = ModelCatalog.getInstance();
