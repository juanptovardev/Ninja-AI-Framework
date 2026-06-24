export type LLMProvider = 'openai' | 'anthropic' | 'ollama' | 'openrouter' | 'groq';

export type LLMMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type LLMRequest = {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
};

export type LLMResponse = {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: {
    index: number;
    message: LLMMessage;
    finish_reason: string | null;
  }[];
  usage: TokenUsage;
};

export type LLMStreamChunk = {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: {
    index: number;
    delta: Partial<LLMMessage>;
    finish_reason: string | null;
  }[];
};

export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

// LLMError is now exported from @ninja/contracts (WP-B1)
// Use: import { LLMError } from '@ninja/contracts';
