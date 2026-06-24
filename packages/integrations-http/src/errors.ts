export class NinjaHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data?: unknown,
    public readonly url?: string
  ) {
    super(message);
    this.name = 'NinjaHttpError';
  }
}

export class NinjaTimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number,
    public readonly url?: string
  ) {
    super(message);
    this.name = 'NinjaTimeoutError';
  }
}

export class NinjaRetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error,
    public readonly url?: string
  ) {
    super(message);
    this.name = 'NinjaRetryError';
  }
}
