export const DEFAULT_TIMEOUTS = {
  fs: 5_000,
  engram: 10_000,
  lightrag: 15_000,
  http: 30_000,
  llm: 90_000,
  llmReasoning: 180_000,
} as const;

export type TimeoutCategory = keyof typeof DEFAULT_TIMEOUTS;

export function getTimeout(category: TimeoutCategory, override?: number): number {
  const envKey = `NINJA_TIMEOUT_${category.toUpperCase()}`;
  const envValue = process.env[envKey];
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return override ?? DEFAULT_TIMEOUTS[category];
}
