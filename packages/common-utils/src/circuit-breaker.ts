export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  successThreshold?: number;
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export class CircuitOpenError extends Error {
  constructor(
    public readonly circuitName: string,
    public readonly retryAt: number,
  ) {
    super(`Circuit ${circuitName} is OPEN; retry after ${new Date(retryAt).toISOString()}`);
    this.name = 'CircuitOpenError';
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private nextAttemptAt = 0;
  private readonly opts: Required<CircuitBreakerOptions>;

  constructor(
    private readonly name: string,
    opts: CircuitBreakerOptions,
  ) {
    this.opts = {
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
      successThreshold: 2,
      onStateChange: () => {},
      ...opts,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptAt) {
        throw new CircuitOpenError(this.name, this.nextAttemptAt);
      }
      this.transitionTo('HALF_OPEN');
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptAt = 0;
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.opts.successThreshold) {
        this.transitionTo('CLOSED');
      }
    }
    this.failureCount = 0;
  }

  private onFailure(): void {
    this.failureCount++;
    this.successCount = 0;
    if (this.state === 'HALF_OPEN' || this.failureCount >= this.opts.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  private transitionTo(next: CircuitState): void {
    const prev = this.state;
    this.state = next;
    if (next === 'OPEN') {
      this.nextAttemptAt = Date.now() + this.opts.resetTimeoutMs;
    }
    this.opts.onStateChange(prev, next);
  }
}
