import { err, ok, type Result } from './result.js';

export class JsonParseError extends SyntaxError {
  readonly kind: 'syntax' | 'empty-input';
  readonly position: number;

  constructor(
    message: string,
    kind: 'syntax' | 'empty-input' | undefined = 'syntax',
    position = -1
  ) {
    super(message);
    this.name = 'JsonParseError';
    this.kind = kind;
    this.position = position;
  }
}

export function safeJsonParse<T = unknown>(text: string): Result<T, JsonParseError>;
export function safeJsonParse<T = unknown, F = unknown>(text: string, fallback: F): T | F;
export function safeJsonParse<T = unknown, F = unknown>(
  text: string,
  fallback?: F
): Result<T, JsonParseError> | T | F {
  if (text.trim() === '') {
    return fallback !== undefined
      ? fallback
      : err(new JsonParseError('Input is empty or whitespace-only', 'empty-input'));
  }
  try {
    const parsed = JSON.parse(text) as T;
    return fallback !== undefined ? parsed : ok(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const position = parsePosition(message);
    const parseError = new JsonParseError(message, 'syntax', position);
    return fallback !== undefined ? (fallback as F) : err(parseError);
  }
}

function parsePosition(message: string): number {
  const match = /position (\d+)/.exec(message);
  return match !== null ? Number(match[1]) : -1;
}
