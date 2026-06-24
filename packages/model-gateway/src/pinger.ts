import type { EventBus } from '@ninja/events';
import { eventBus as globalEventBus, createEvent } from '@ninja/events';
import type { ModelCatalog } from './catalog.js';
import type { ModelEntry } from './schema.js';

export interface PingResult {
  modelId: string;
  available: boolean;
  latencyMs: number;
  error?: string;
}

export interface PingCompletedPayload {
  timestamp: string;
  total: number;
  available: number;
  unavailable: number;
  results: PingResult[];
}

const PROVIDER_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1/models',
  anthropic: 'https://api.anthropic.com/v1/models',
  ollama: 'http://localhost:11434/api/tags',
  qwen: 'https://dashscope.aliyuncs.com/api/v1/models',
  deepseek: 'https://api.deepseek.com/models',
  google: 'https://generativelanguage.googleapis.com/v1/models',
  meta: 'https://api.together.xyz/v1/models',
};

export class ModelPinger {
  private static instance: ModelPinger | null = null;
  private eventBus: EventBus;
  private timeoutMs: number;

  private constructor(eventBus: EventBus, timeoutMs: number = 5000) {
    this.eventBus = eventBus;
    this.timeoutMs = timeoutMs;
  }

  setTimeout(ms: number): void {
    this.timeoutMs = ms;
  }

  private getHealthEndpoint(model: ModelEntry): string | null {
    const endpoint = PROVIDER_ENDPOINTS[model.provider];
    if (!endpoint) {
      return null;
    }
    return endpoint;
  }

  async ping(modelId: string, baseUrl: string, apiKey?: string): Promise<PingResult> {
    const startTime = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await globalThis.fetch(baseUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Math.round(performance.now() - startTime);

      if (response.ok) {
        return {
          modelId,
          available: true,
          latencyMs,
        };
      }

      return {
        modelId,
        available: false,
        latencyMs,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      const latencyMs = Math.round(performance.now() - startTime);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return {
            modelId,
            available: false,
            latencyMs,
            error: `Timeout after ${this.timeoutMs}ms`,
          };
        }
        return {
          modelId,
          available: false,
          latencyMs,
          error: error.message,
        };
      }

      return {
        modelId,
        available: false,
        latencyMs,
        error: 'Unknown error',
      };
    }
  }

  async pingAll(catalog: ModelCatalog): Promise<void> {
    const models = catalog.getAll();
    const results: PingResult[] = [];

    const pingPromises = models.map(async (model) => {
      const endpoint = this.getHealthEndpoint(model);
      if (!endpoint) {
        const result: PingResult = {
          modelId: model.id,
          available: false,
          latencyMs: 0,
          error: `Unknown provider: ${model.provider}`,
        };
        results.push(result);
        return result;
      }

      // Para ollama local no necesitamos API key
      const apiKey =
        model.provider === 'ollama'
          ? undefined
          : process.env[`${model.provider.toUpperCase()}_API_KEY`];

      const result = await this.ping(model.id, endpoint, apiKey);
      results.push(result);

      // Actualizar disponibilidad en el catálogo
      catalog.updateAvailability(model.id, result.available);

      return result;
    });

    await Promise.allSettled(pingPromises);

    const available = results.filter((r) => r.available).length;
    const unavailable = results.filter((r) => !r.available).length;

    const payload: PingCompletedPayload = {
      timestamp: new Date().toISOString(),
      total: results.length,
      available,
      unavailable,
      results,
    };

    const event = createEvent('model.ping.completed', 'model-gateway', payload);
    this.eventBus.emit(event);
  }

  async pingOnStartup(catalog: ModelCatalog): Promise<void> {
    await this.pingAll(catalog);
  }

  static getInstance(eventBus?: EventBus, timeoutMs?: number): ModelPinger {
    if (!ModelPinger.instance) {
      ModelPinger.instance = new ModelPinger(eventBus ?? globalEventBus, timeoutMs);
    }
    return ModelPinger.instance;
  }
}

export const modelPinger = ModelPinger.getInstance();
