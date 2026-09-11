import { LLMProvider, LLMRequest, LLMResponse } from './schema';
import { LLMClient } from './client';
import { LLMError, ErrorCodes } from '@ninja/contracts';

const TIER_MAPPING: Record<LLMProvider, number> = {
  openai: 1,
  anthropic: 1,
  openrouter: 1,
  groq: 2,
  ollama: 3,
};

export class LLMRegistry {
  private static instance: LLMRegistry | undefined;
  private clients: Map<LLMProvider, LLMClient> = new Map();

  private constructor() {}

  public static getInstance(): LLMRegistry {
    if (!LLMRegistry.instance) {
      LLMRegistry.instance = new LLMRegistry();
    }
    return LLMRegistry.instance;
  }

  public static resetInstance(): void {
    LLMRegistry.instance = undefined;
  }

  public register(provider: LLMProvider, baseUrl: string, apiKey: string): void {
    if (this.clients.has(provider)) {
      throw new LLMError(
        ErrorCodes.LLM_PROVIDER_ALREADY_REGISTERED,
        `Provider ${provider} is already registered`
      );
    }
    this.clients.set(provider, new LLMClient(provider, baseUrl, apiKey));
  }

  public get(provider: LLMProvider): LLMClient {
    const client = this.clients.get(provider);
    if (!client) {
      throw new LLMError(
        ErrorCodes.LLM_PROVIDER_NOT_REGISTERED,
        `Provider ${provider} is not registered`
      );
    }
    return client;
  }

  public has(provider: LLMProvider): boolean {
    return this.clients.has(provider);
  }

  public async executeWithFallback(
    providerId: LLMProvider,
    request: LLMRequest
  ): Promise<LLMResponse> {
    const client = this.get(providerId);
    try {
      return await client.complete(request);
    } catch (error) {
      const tier = TIER_MAPPING[providerId] || 1;

      let alternative: LLMClient | null = null;
      for (const [p, c] of this.clients.entries()) {
        if (p !== providerId && (TIER_MAPPING[p] || 1) === tier) {
          alternative = c;
          break;
        }
      }

      if (!alternative) {
        throw error;
      }

      return await alternative.complete(request);
    }
  }
}
