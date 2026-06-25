/**
 * @ninja/contracts — errors.ts
 * Jerarquía de errores tipados para el Ninja AI Framework.
 * ADR: docs/adr/0001-ninja-error-hierarchy.md
 */

// ─────────────────────────────────────────────────────────────────────────────
// Domain
// ─────────────────────────────────────────────────────────────────────────────

export type NinjaErrorDomain =
  | 'llm'
  | 'budget'
  | 'vault'
  | 'sentinel'
  | 'roster'
  | 'gateway'
  | 'shell'
  | 'fs'
  | 'flow'
  | 'engine'
  | 'runtime';

// ─────────────────────────────────────────────────────────────────────────────
// ErrorCode — branded type (M3) to prevent typos at compile time
// ─────────────────────────────────────────────────────────────────────────────

/** @see ErrorCodes for all valid values */
export type ErrorCode = string & { readonly __brand: unique symbol };

/** Catalog of all known error codes. Extend here when adding new WPs. */
export const ErrorCodes = {
  // LLM / integrations-llm
  /** LLM request exceeded the configured timeout (retryable) */
  LLM_TIMEOUT: 'LLM_TIMEOUT' as ErrorCode,
  /** LLM provider returned 429 Rate Limited (retryable) */
  LLM_RATE_LIMITED: 'LLM_RATE_LIMITED' as ErrorCode,
  /** LLM provider returned 401 Unauthorized */
  LLM_AUTH: 'LLM_AUTH' as ErrorCode,
  /** LLM provider returned 5xx Server Error */
  LLM_SERVER: 'LLM_SERVER' as ErrorCode,
  /** Generic LLM call failure */
  LLM_CALL_FAILED: 'LLM_CALL_FAILED' as ErrorCode,
  /** All models in the fallback chain have been exhausted */
  LLM_ALL_PROVIDERS_FAILED: 'LLM_ALL_PROVIDERS_FAILED' as ErrorCode,

  // Sentinel / approval
  /** Approval request was denied by policy */
  APPROVAL_DENIED: 'APPROVAL_DENIED' as ErrorCode,
  /** Approval request timed out waiting for resolution (retryable) */
  APPROVAL_TIMEOUT: 'APPROVAL_TIMEOUT' as ErrorCode,
  /** Approval request ID not found */
  APPROVAL_NOT_FOUND: 'APPROVAL_NOT_FOUND' as ErrorCode,

  // Kage Engine
  /** Engine received an invalid intake request */
  ENGINE_INVALID_INTAKE: 'ENGINE_INVALID_INTAKE' as ErrorCode,
  /** Engine plan generation failed */
  ENGINE_PLAN_FAILED: 'ENGINE_PLAN_FAILED' as ErrorCode,
  /** Engine coordinator step failed */
  ENGINE_COORDINATOR_FAILED: 'ENGINE_COORDINATOR_FAILED' as ErrorCode,

  // Roster
  /** Agent ID not found in the roster */
  ROSTER_AGENT_NOT_FOUND: 'ROSTER_AGENT_NOT_FOUND' as ErrorCode,
  /** Agent definition is invalid or malformed */
  ROSTER_INVALID_DEFINITION: 'ROSTER_INVALID_DEFINITION' as ErrorCode,

  // Budget / Model Gateway
  /** Session token budget exceeded — operation blocked */
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED' as ErrorCode,

  // HTTP / integrations-http (WP-B14)
  /** HTTP request blocked by SSRF guard — target resolves to a private/reserved IP */
  HTTP_SSRF_BLOCKED: 'HTTP_SSRF_BLOCKED' as ErrorCode,

  // Auth (WP-B11)
  /** Missing or invalid X-Ninja-Key header — authentication required */
  AUTH_REQUIRED: 'AUTH_REQUIRED' as ErrorCode,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// NinjaErrorOptions
// ─────────────────────────────────────────────────────────────────────────────

export interface NinjaErrorOptions {
  /** Native ES2022 error cause chain */
  cause?: unknown;
  /** Whether the operation can be retried automatically */
  retryable?: boolean;
  /** HTTP status code for use in the error handler (WP-C1) */
  httpStatus?: number;
  /** Human-readable suggestion for resolving the error */
  suggestion?: string;
  /** Structured context — PII keys are redacted in toJSON() */
  context?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// PII redaction (M4)
// ─────────────────────────────────────────────────────────────────────────────

const SENSITIVE_KEYS = ['apikey', 'authorization', 'token', 'password', 'secret', 'bearer'];

function redactPII(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactPII(v, depth + 1));

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    result[k] = SENSITIVE_KEYS.includes(k.toLowerCase()) ? '[REDACTED]' : redactPII(v, depth + 1);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stack truncation (M5)
// ─────────────────────────────────────────────────────────────────────────────

function truncateStack(stack: string | undefined, maxLines = 20): string | undefined {
  if (!stack) return undefined;
  const lines = stack.split('\n');
  if (lines.length <= maxLines) return stack;
  return lines.slice(0, maxLines - 1).join('\n') + '\n  ... (truncated)';
}

// ─────────────────────────────────────────────────────────────────────────────
// Cause chain serialization (M6)
// ─────────────────────────────────────────────────────────────────────────────

function serializeCause(cause: unknown, depth: number): unknown {
  if (depth >= 3) return '[Cause chain truncated at depth 3]';
  if (cause instanceof NinjaError) return cause._toJSONInternal(depth + 1);
  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: cause.message,
      stack: truncateStack(cause.stack),
    };
  }
  return String(cause);
}

// ─────────────────────────────────────────────────────────────────────────────
// NinjaError base class
// ─────────────────────────────────────────────────────────────────────────────

export class NinjaError extends Error {
  readonly code: string;
  readonly domain: NinjaErrorDomain;
  readonly retryable: boolean;
  readonly httpStatus?: number;
  readonly suggestion?: string;
  readonly context?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    domain: NinjaErrorDomain,
    opts: NinjaErrorOptions = {},
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    // Preserve instanceof after TypeScript transpilation
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;

    this.code = code;
    this.domain = domain;
    this.retryable = opts.retryable ?? false;
    if (opts.httpStatus !== undefined) this.httpStatus = opts.httpStatus;
    if (opts.suggestion !== undefined) this.suggestion = opts.suggestion;
    if (opts.context !== undefined) this.context = opts.context;
  }

  /** Internal method called recursively for cause chain serialization */
  _toJSONInternal(depth: number): Record<string, unknown> {
    const isProd = process.env['NODE_ENV'] === 'production';
    return {
      name: this.name,
      code: this.code,
      domain: this.domain,
      message: this.message,
      retryable: this.retryable,
      ...(this.httpStatus !== undefined && { httpStatus: this.httpStatus }),
      ...(this.suggestion !== undefined && { suggestion: this.suggestion }),
      ...(this.context !== undefined && { context: redactPII(this.context) }),
      ...(this.cause !== undefined && { cause: serializeCause(this.cause, depth) }),
      ...(!isProd && this.stack !== undefined && { stack: truncateStack(this.stack) }),
    };
  }

  /**
   * Safe JSON serialization:
   * - Omits stack in production (M5)
   * - Truncates stack to 20 lines in development (M5)
   * - Redacts PII keys in context (M4)
   * - Serializes cause chain recursively up to depth 3 (M6)
   * - Automatically used by JSON.stringify()
   */
  toJSON(): Record<string, unknown> {
    return this._toJSONInternal(0);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain subclasses (thin extends — only fix the domain)
// ─────────────────────────────────────────────────────────────────────────────

export class LLMError extends NinjaError {
  constructor(code: string, message: string, opts?: NinjaErrorOptions) {
    super(code, message, 'llm', opts);
  }
}

export class BudgetError extends NinjaError {
  constructor(message: string, opts?: NinjaErrorOptions) {
    super(ErrorCodes.BUDGET_EXCEEDED, message, 'budget', { httpStatus: 429, retryable: false, ...opts });
    Object.defineProperty(this, 'name', { value: 'BudgetError' });
  }
}

export class VaultError extends NinjaError {
  constructor(code: string, message: string, opts?: NinjaErrorOptions) {
    super(code, message, 'vault', opts);
  }
}

export class SentinelError extends NinjaError {
  constructor(code: string, message: string, opts?: NinjaErrorOptions) {
    super(code, message, 'sentinel', opts);
  }
}

export class ShellError extends NinjaError {
  constructor(code: string, message: string, opts?: NinjaErrorOptions) {
    super(code, message, 'shell', opts);
  }
}

export class FlowError extends NinjaError {
  constructor(code: string, message: string, opts?: NinjaErrorOptions) {
    super(code, message, 'flow', opts);
  }
}

export class EngineError extends NinjaError {
  constructor(code: string, message: string, opts?: NinjaErrorOptions) {
    super(code, message, 'engine', opts);
  }
}

export class RosterError extends NinjaError {
  constructor(code: string, message: string, opts?: NinjaErrorOptions) {
    super(code, message, 'roster', opts);
  }
}

export class SSRFError extends NinjaError {
  constructor(message: string, opts?: NinjaErrorOptions) {
    super(ErrorCodes.HTTP_SSRF_BLOCKED, message, 'runtime', {
      httpStatus: 403,
      retryable: false,
      ...opts,
    });
    Object.defineProperty(this, 'name', { value: 'SSRFError' });
  }
}

export class AuthError extends NinjaError {
  constructor(message: string, opts?: NinjaErrorOptions) {
    super(ErrorCodes.AUTH_REQUIRED, message, 'runtime', {
      httpStatus: 401,
      retryable: false,
      ...opts,
    });
    Object.defineProperty(this, 'name', { value: 'AuthError' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (M1, M2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Type guard — narrows unknown to NinjaError (M2).
 * Use in catch blocks and error handlers instead of instanceof chains.
 * @example
 * catch (e) { if (isNinjaError(e)) { e.code; e.domain; } }
 */
export function isNinjaError(e: unknown): e is NinjaError {
  return e instanceof NinjaError;
}

/**
 * Converts unknown catch values to NinjaError, preserving cause (M1).
 * - If already a NinjaError, returns it unchanged.
 * - If an Error, wraps it with cause=original.
 * - Otherwise, converts via String().
 * @example
 * catch (e: unknown) { throw wrapUnknown(e, ErrorCodes.LLM_CALL_FAILED, 'llm'); }
 */
export function wrapUnknown(
  e: unknown,
  code: string,
  domain: NinjaErrorDomain,
  opts?: Omit<NinjaErrorOptions, 'cause'>,
): NinjaError {
  if (isNinjaError(e)) return e;
  if (e instanceof Error) {
    return new NinjaError(code, e.message, domain, { ...opts, cause: e });
  }
  return new NinjaError(code, String(e), domain, { ...opts, cause: e });
}
