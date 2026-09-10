export interface RetryWithBackoffOptions<TError extends Error = Error> {
  maxRetries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  jitter?: boolean;
  respectRetryAfter?: boolean;
  retryOn?: (error: TError, attempt: number) => boolean;
  onRetry?: (error: TError, attempt: number, delayMs: number) => void;
}

interface ResolvedBackoffOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  jitter: boolean;
  respectRetryAfter: boolean;
}

const BACKOFF_DEFAULTS: Omit<ResolvedBackoffOptions, 'maxRetries'> = {
  baseDelayMs: 100,
  maxDelayMs: 15_000,
  backoffFactor: 2,
  jitter: true,
  respectRetryAfter: false,
};

export async function retryWithBackoff<T, TError extends Error = Error>(
  fn: () => Promise<T>,
  options: RetryWithBackoffOptions<TError>
): Promise<T> {
  const opts: ResolvedBackoffOptions = { ...BACKOFF_DEFAULTS, ...options };
  const retryOn = options.retryOn;
  const onRetry = options.onRetry;
  let lastError: TError | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as TError;
      const attemptNumber = attempt + 1;
      const mayRetry = attempt < opts.maxRetries && (retryOn?.(lastError, attemptNumber) ?? true);
      if (!mayRetry) break;

      const retryAfterDelay = opts.respectRetryAfter ? getRetryAfterDelayMs(lastError) : null;
      const delayMs = retryAfterDelay !== null ? retryAfterDelay : calculateDelay(attempt, opts);

      onRetry?.(lastError, attemptNumber, delayMs);
      await sleep(delayMs);
    }
  }

  throw lastError ?? new Error('retryWithBackoff: fn never produced a value or an error');
}

function calculateDelay(attempt: number, opts: ResolvedBackoffOptions): number {
  const exponential = opts.baseDelayMs * Math.pow(opts.backoffFactor, attempt);
  const capped = Math.min(exponential, opts.maxDelayMs);
  if (!opts.jitter) return capped;
  return Math.round(capped * (0.5 + Math.random() * 0.5));
}

export function getRetryAfterDelayMs(error: Error): number | null {
  const raw = readRetryAfter(error);
  if (raw === undefined) return null;
  if (raw instanceof Date) return Math.max(0, raw.getTime() - Date.now());
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? raw * 1000 : null;
  }
  const numeric = Number(raw);
  if (/^\d+(\.\d+)?$/.test(raw.trim()) && Number.isFinite(numeric) && numeric >= 0) {
    return numeric * 1000;
  }
  const epoch = Date.parse(raw);
  return Number.isNaN(epoch) ? null : Math.max(0, epoch - Date.now());
}

function readRetryAfter(error: Error): number | Date | string | undefined {
  const self = error as unknown as Record<string, unknown>;
  const direct = self.retryAfter ?? self['retry-after'];
  if (direct instanceof Date || typeof direct === 'number' || typeof direct === 'string') {
    return direct;
  }
  const data = self.data;
  if (typeof data === 'object' && data !== null) {
    const record = data as Record<string, unknown>;
    const fromData = record.retryAfter ?? record['retry-after'];
    if (fromData instanceof Date || typeof fromData === 'number' || typeof fromData === 'string') {
      return fromData;
    }
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
