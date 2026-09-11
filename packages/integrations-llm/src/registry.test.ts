import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMRegistry } from './registry';
import type { LLMResponse } from './schema';

function makeResponse(id: string): LLMResponse {
  return {
    id,
    object: 'chat.completion',
    created: 0,
    model: 'gpt-4',
    choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

describe('LLMRegistry Fallback Logic', () => {
  beforeEach(() => {
    // Reset singleton instance between tests
    LLMRegistry.resetInstance();
    vi.restoreAllMocks();
  });

  it('should fallback to a provider of the same tier if complete fails', async () => {
    const registry = LLMRegistry.getInstance();

    // Register two providers in the same tier (tier 1: openai and anthropic)
    registry.register('openai', 'url1', 'key1');
    registry.register('anthropic', 'url2', 'key2');

    const clientOpenAi = registry.get('openai');
    const clientAnthropic = registry.get('anthropic');

    // Mock complete to fail on openai
    vi.spyOn(clientOpenAi, 'complete').mockRejectedValue(new Error('Persistent error'));

    // Mock complete to succeed on anthropic
    vi.spyOn(clientAnthropic, 'complete').mockResolvedValue(makeResponse('fallback-success'));

    const result = await registry.executeWithFallback('openai', { model: 'gpt-4', messages: [] });

    expect(result.id).toBe('fallback-success');
    expect(clientOpenAi.complete).toHaveBeenCalledTimes(1);
    expect(clientAnthropic.complete).toHaveBeenCalledTimes(1);
  });

  it('should throw if no alternative in the same tier exists', async () => {
    const registry = LLMRegistry.getInstance();

    // Register one paid and one local (openai = 1, ollama = 3)
    registry.register('openai', 'url1', 'key1');
    registry.register('ollama', 'url2', 'key2');

    const clientOpenAi = registry.get('openai');
    const clientOllama = registry.get('ollama');

    vi.spyOn(clientOpenAi, 'complete').mockRejectedValue(new Error('Persistent error'));
    vi.spyOn(clientOllama, 'complete').mockResolvedValue(makeResponse('fallback-success'));

    await expect(
      registry.executeWithFallback('openai', { model: 'gpt-4', messages: [] })
    ).rejects.toThrow('Persistent error');

    expect(clientOpenAi.complete).toHaveBeenCalledTimes(1);
    expect(clientOllama.complete).not.toHaveBeenCalled();
  });

  it('should return result from main client if it succeeds', async () => {
    const registry = LLMRegistry.getInstance();
    registry.register('openai', 'url1', 'key1');
    registry.register('anthropic', 'url2', 'key2');

    const clientOpenAi = registry.get('openai');
    const clientAnthropic = registry.get('anthropic');

    vi.spyOn(clientOpenAi, 'complete').mockResolvedValue(makeResponse('main-success'));
    vi.spyOn(clientAnthropic, 'complete').mockResolvedValue(makeResponse('fallback-success'));

    const result = await registry.executeWithFallback('openai', { model: 'gpt-4', messages: [] });

    expect(result.id).toBe('main-success');
    expect(clientOpenAi.complete).toHaveBeenCalledTimes(1);
    expect(clientAnthropic.complete).not.toHaveBeenCalled();
  });
});
