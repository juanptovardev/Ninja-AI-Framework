import { NinjaError } from '@ninja/contracts';

export interface SanitizedError {
  error: string;
  code?: string;
  details?: unknown;
}

export function sanitizeError(
  err: unknown,
  env: 'production' | 'development' | 'test'
): SanitizedError {
  if (err instanceof NinjaError) {
    return {
      error: err.message,
      code: err.code,
      ...(env !== 'production' && err.context ? { details: err.context } : {}),
    };
  }

  if (env === 'production') {
    return { error: 'Internal error', code: 'INTERNAL_ERROR' };
  }

  if (err instanceof Error) {
    return { error: err.message, code: 'INTERNAL_ERROR' };
  }

  return { error: String(err), code: 'INTERNAL_ERROR' };
}
