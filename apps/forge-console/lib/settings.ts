import type { ProviderType } from './types';

export const providerTypeOptions: ReadonlyArray<{ value: ProviderType; label: string }> = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'ollama', label: 'Ollama (Local)' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'groq', label: 'Groq' },
  { value: 'custom', label: 'Custom' },
];

export const providerDefaults: Record<ProviderType, { baseUrl: string; models: string[] }> = {
  openai: { baseUrl: 'https://api.openai.com', models: ['gpt-4', 'gpt-3.5-turbo'] },
  anthropic: { baseUrl: 'https://api.anthropic.com', models: ['claude-3-opus', 'claude-3-sonnet'] },
  ollama: { baseUrl: 'http://localhost:11434', models: ['llama2', 'codellama'] },
  openrouter: { baseUrl: 'https://openrouter.ai/api', models: ['anthropic/claude-3-opus'] },
  groq: { baseUrl: 'https://api.groq.com/openai', models: ['mixtral-8x7b-32768'] },
  custom: { baseUrl: '', models: [] },
};

export function buildProviderFormDefaults(type: ProviderType): {
  name: string;
  baseUrl: string;
  models: string;
} {
  const defaults = providerDefaults[type];
  const optionLabel = providerTypeOptions.find((o) => o.value === type)?.label || '';
  return {
    name: type === 'custom' ? '' : optionLabel,
    baseUrl: defaults.baseUrl,
    models: defaults.models.join(', '),
  };
}
