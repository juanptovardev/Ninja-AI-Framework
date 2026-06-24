import { eventBus, createEvent } from '@ninja/events';
import { NinjaRetryError } from './errors';

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryOn?: number[];
  retryOnErrorTypes?: string[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  retryOn: [429, 503, 502, 504, 408],
  retryOnErrorTypes: ['NinjaTimeoutError', 'AbortError'],
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>,
  url?: string
): Promise<T> {
  const finalConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const shouldRetry =
        attempt < finalConfig.maxRetries &&
        (isRetryableError(lastError, finalConfig) || isRetryableStatus(lastError, finalConfig));

      if (!shouldRetry) {
        break;
      }

      const delay = calculateDelay(attempt, finalConfig);

      eventBus.emit(
        createEvent('http.request.retried', 'integrations-http', {
          url: url || 'unknown',
          attempt: attempt + 1,
          delay,
        })
      );

      await sleep(delay);
    }
  }

  throw new NinjaRetryError(
    `Max retries (${finalConfig.maxRetries}) exceeded`,
    finalConfig.maxRetries,
    lastError,
    url
  );
}

function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 100;
  return Math.min(exponentialDelay + jitter, config.maxDelay);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: Error, config: RetryConfig): boolean {
  if (!config.retryOnErrorTypes) return false;
  return config.retryOnErrorTypes.includes(error.name);
}

function isRetryableStatus(error: Error, config: RetryConfig): boolean {
  if (!config.retryOn) return false;
  const statusMatch = error.message.match(/status (\d+)/);
  if (!statusMatch) return false;
  const status = parseInt(statusMatch[1], 10);
  return config.retryOn.includes(status);
}
