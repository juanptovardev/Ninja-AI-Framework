import type {
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  LLMMessage,
  TokenUsage,
} from '@ninja/integrations-llm';

interface MockLLMClientConfig {
  responses?: Map<string, string>;
  defaultResponse?: string;
}

interface CallHistoryEntry {
  request: LLMRequest;
  timestamp: number;
}

export class MockLLMClient {
  private responses: Map<string, string>;
  private defaultResponse: string;
  public callHistory: CallHistoryEntry[] = [];
  private nextError: {
    type: 'auth_error' | 'rate_limit' | 'server_error';
    message: string;
  } | null = null;

  constructor(config: MockLLMClientConfig = {}) {
    this.responses = config.responses ?? new Map();
    this.defaultResponse = config.defaultResponse ?? 'Mock LLM response';
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    this.callHistory.push({
      request,
      timestamp: Date.now(),
    });

    if (this.nextError) {
      const error = new Error(this.nextError.message);
      error.name = this.nextError.type;
      this.nextError = null;
      throw error;
    }

    const userMessage = request.messages
      .filter((m): m is LLMMessage & { role: 'user' } => m.role === 'user')
      .pop();

    let responseContent = this.defaultResponse;

    if (userMessage) {
      for (const [pattern, response] of this.responses) {
        if (userMessage.content.toLowerCase().includes(pattern.toLowerCase())) {
          responseContent = response;
          break;
        }
      }
    }

    const userTokens = request.messages.reduce((acc, m) => acc + m.content.length, 0);

    const usage: TokenUsage = {
      prompt_tokens: Math.max(userTokens, 10),
      completion_tokens: responseContent.length,
      total_tokens: Math.max(userTokens, 10) + responseContent.length,
    };

    const response: LLMResponse = {
      id: `mock-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: responseContent,
          },
          finish_reason: 'stop',
        },
      ],
      usage,
    };

    return response;
  }

  async *stream(request: LLMRequest): AsyncGenerator<LLMStreamChunk, void, unknown> {
    this.callHistory.push({
      request,
      timestamp: Date.now(),
    });

    const userMessage = request.messages
      .filter((m): m is LLMMessage & { role: 'user' } => m.role === 'user')
      .pop();

    let responseContent = this.defaultResponse;

    if (userMessage) {
      for (const [pattern, response] of this.responses) {
        if (userMessage.content.toLowerCase().includes(pattern.toLowerCase())) {
          responseContent = response;
          break;
        }
      }
    }

    const chunk: LLMStreamChunk = {
      id: `mock-stream-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [
        {
          index: 0,
          delta: {
            role: 'assistant',
            content: responseContent,
          },
          finish_reason: 'stop',
        },
      ],
    };

    yield chunk;
  }

  setNextError(error: {
    type: 'auth_error' | 'rate_limit' | 'server_error';
    message: string;
  }): void {
    this.nextError = error;
  }

  setDefaultResponse(content: string): void {
    this.defaultResponse = content;
  }

  clear(): void {
    this.callHistory = [];
    this.nextError = null;
  }
}
