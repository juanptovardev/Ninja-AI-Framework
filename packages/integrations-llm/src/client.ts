import { LLMProvider, LLMRequest, LLMResponse, LLMStreamChunk, LLMError } from './schema';
import { eventBus, createEvent } from '@ninja/events';
import { createLogger } from '@ninja/logging';

export interface LLMClientOptions {
  delayFn?: (ms: number) => Promise<void>;
}

export class LLMClient {
  private provider: LLMProvider;
  private baseUrl: string;
  private apiKey: string;
  private logger: ReturnType<typeof createLogger>;
  private delayFn: (ms: number) => Promise<void>;

  constructor(provider: LLMProvider, baseUrl: string, apiKey: string, options?: LLMClientOptions) {
    this.provider = provider;
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.logger = createLogger(`LLM-${provider}`);
    this.delayFn = options?.delayFn || ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  private async fetchWithRetry(url: string, init: RequestInit, model: string): Promise<Response> {
    const delays = [1000, 2000, 4000];
    const maxRetries = 3;
    let attempt = 0;

    while (true) {
      const response = await globalThis.fetch(url, init);

      if (!response.ok && (response.status === 429 || response.status >= 500)) {
        if (attempt < maxRetries) {
          const delay = delays[attempt];
          await this.delayFn(delay);
          attempt++;
          continue;
        } else {
          if (response.status === 429) {
            eventBus.emit(
              createEvent('llm.rate_limited', 'integrations-llm', {
                provider: this.provider,
                model: model,
              })
            );
          }
        }
      }

      return response;
    }
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    eventBus.emit(
      createEvent('llm.request.started', 'integrations-llm', {
        provider: this.provider,
        model: request.model,
      })
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await this.fetchWithRetry(
        `${this.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        },
        request.model
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        let errorData: Record<string, unknown> = { _rawText: errorText };
        try {
          if (errorText) errorData = JSON.parse(errorText);
        } catch {
          errorData = { _rawText: errorText };
        }
        throw this.mapError(errorData, response.status);
      }

      const data: LLMResponse = await response.json();
      eventBus.emit(
        createEvent('llm.request.completed', 'integrations-llm', {
          provider: this.provider,
          model: request.model,
        })
      );
      return data;
    } catch (error: unknown) {
      const isLlmError = error && typeof error === 'object' && 'message' in error;
      const errorMessage = isLlmError ? (error as { message: string }).message : String(error);
      const errObj = error instanceof Error ? error : new Error(errorMessage);
      
      eventBus.emit(
        createEvent('llm.request.failed', 'integrations-llm', {
          provider: this.provider,
          model: request.model,
          error: errObj,
        })
      );
      if (errObj.name === 'AbortError') {
        throw new Error('Request timed out after 30 seconds');
      }
      throw errObj;
    }
  }

  async *stream(request: LLMRequest): AsyncGenerator<LLMStreamChunk, void, unknown> {
    eventBus.emit(
      createEvent('llm.request.started', 'integrations-llm', {
        provider: this.provider,
        model: request.model,
      })
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await this.fetchWithRetry(
        `${this.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({ ...request, stream: true }),
          signal: controller.signal,
        },
        request.model
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        let errorData: Record<string, unknown> = { _rawText: errorText };
        try {
          if (errorText) errorData = JSON.parse(errorText);
        } catch {
          errorData = { _rawText: errorText };
        }
        throw this.mapError(errorData, response.status);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') {
            eventBus.emit(
              createEvent('llm.request.completed', 'integrations-llm', {
                provider: this.provider,
                model: request.model,
              })
            );
            return;
          }

          try {
            const chunk: LLMStreamChunk = JSON.parse(jsonStr);
            yield chunk;
          } catch (e) {
            continue;
          }
        }
      }
    } catch (error: unknown) {
      const isLlmError = error && typeof error === 'object' && 'message' in error;
      const errorMessage = isLlmError ? (error as { message: string }).message : String(error);
      const errObj = error instanceof Error ? error : new Error(errorMessage);
      
      eventBus.emit(
        createEvent('llm.request.failed', 'integrations-llm', {
          provider: this.provider,
          model: request.model,
          error: errObj,
        })
      );
      if (errObj.name === 'AbortError') {
        throw new Error('Request timed out after 30 seconds');
      }
      throw errObj;
    }
  }

  private mapError(errorData: Record<string, unknown>, status: number): LLMError {
    const errorBody = errorData.error as Record<string, unknown> | undefined;
    const rawMsg = (errorBody?.message as string) || (errorData.message as string) || (errorData.detail as string) || (errorData._rawText as string) || JSON.stringify(errorData);
    
    if (status === 401) {
      return { type: 'auth_error', message: rawMsg || 'Invalid API key' };
    }
    if (status === 429) {
      return { type: 'rate_limit', message: rawMsg || 'Rate limit exceeded' };
    }
    if (status >= 500) {
      return {
        type: 'server_error',
        message: rawMsg || 'LLM server error',
        code: status,
      };
    }
    return {
      type: 'server_error',
      message: rawMsg || 'Unknown error',
      code: status,
    };
  }
}
