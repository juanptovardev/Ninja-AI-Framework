/**
 * @ninja/contracts — errors.test.ts
 * TDD tests for NinjaError hierarchy (WP-B1)
 * These tests define the contract BEFORE implementation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NinjaError,
  LLMError,
  BudgetError,
  VaultError,
  SentinelError,
  ShellError,
  FlowError,
  EngineError,
  RosterError,
  ErrorCodes,
  isNinjaError,
  wrapUnknown,
} from './errors.js';
import type { ErrorCode } from './errors.js';

// ─────────────────────────────────────────────────────────
// 1.1 — Shape básica
// ─────────────────────────────────────────────────────────
describe('NinjaError - shape', () => {
  it('extiende Error y mantiene instanceof', () => {
    const e = new NinjaError('TEST', 'mensaje test', 'runtime');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(NinjaError);
    expect(e.name).toBe('NinjaError');
  });

  it('expone code, domain, retryable=false por defecto', () => {
    const e = new NinjaError('MY_CODE', 'msg', 'llm');
    expect(e.code).toBe('MY_CODE');
    expect(e.domain).toBe('llm');
    expect(e.retryable).toBe(false);
    expect(e.message).toBe('msg');
  });

  it('respeta opts: retryable, httpStatus, suggestion, context', () => {
    const ctx = { taskId: 'abc' };
    const e = new NinjaError('X', 'msg', 'engine', {
      retryable: true,
      httpStatus: 503,
      suggestion: 'Retry in 1s',
      context: ctx,
    });
    expect(e.retryable).toBe(true);
    expect(e.httpStatus).toBe(503);
    expect(e.suggestion).toBe('Retry in 1s');
    expect(e.context).toEqual(ctx);
  });

  it('propaga cause vía Error.cause nativo (ES2022)', () => {
    const inner = new Error('causa interna');
    const e = new NinjaError('X', 'outer', 'runtime', { cause: inner });
    expect(e.cause).toBe(inner);
  });

  it('tiene stack definido', () => {
    const e = new NinjaError('X', 'm', 'runtime');
    expect(e.stack).toBeTypeOf('string');
    expect(e.stack).toContain('NinjaError');
  });
});

// ─────────────────────────────────────────────────────────
// 1.3 — ErrorCodes catalog + subclases + helpers
// ─────────────────────────────────────────────────────────
describe('ErrorCodes catalog', () => {
  it('expone códigos como const object', () => {
    expect(ErrorCodes.LLM_TIMEOUT).toBe('LLM_TIMEOUT');
    expect(ErrorCodes.APPROVAL_DENIED).toBe('APPROVAL_DENIED');
    expect(ErrorCodes.ENGINE_INVALID_INTAKE).toBe('ENGINE_INVALID_INTAKE');
  });

  it('cada código es UPPER_SNAKE_CASE', () => {
    Object.values(ErrorCodes).forEach((c) =>
      expect(c).toMatch(/^[A-Z][A-Z0-9_]*$/),
    );
  });

  it('type ErrorCode acepta valores del catálogo', () => {
    // compile-time check vía type assertion — si compila, pasa
    const code: ErrorCode = ErrorCodes.LLM_TIMEOUT;
    expect(code).toBe('LLM_TIMEOUT');
  });
});

describe('Error subclasses', () => {
  it.each([
    [LLMError, 'llm'],
    [BudgetError, 'budget'],
    [VaultError, 'vault'],
    [SentinelError, 'sentinel'],
    [ShellError, 'shell'],
    [FlowError, 'flow'],
    [EngineError, 'engine'],
    [RosterError, 'roster'],
  ] as const)('%s fija domain=%s y extiende NinjaError', (Cls, domain) => {
    const e = new (Cls as unknown as new (code: string, message: string) => NinjaError)(
      'TEST',
      'test message',
    );
    expect(e.domain).toBe(domain);
    expect(e).toBeInstanceOf(NinjaError);
    expect(e).toBeInstanceOf(Error);
  });

  it('LLMError acepta opts opcionales', () => {
    const e = new LLMError('LLM_TIMEOUT', 'timeout', { retryable: true, httpStatus: 504 });
    expect(e.retryable).toBe(true);
    expect(e.httpStatus).toBe(504);
  });

  it('BudgetError — shape: code=BUDGET_EXCEEDED, httpStatus=429, retryable=false, name=BudgetError', () => {
    const e = new BudgetError('Token budget exceeded for session s1 (limit: 5000)');
    expect(e.code).toBe('BUDGET_EXCEEDED');
    expect(e.httpStatus).toBe(429);
    expect(e.retryable).toBe(false);
    expect(e.name).toBe('BudgetError');
    expect(e.domain).toBe('budget');
    expect(e).toBeInstanceOf(NinjaError);
    expect(e).toBeInstanceOf(BudgetError);
  });
});

describe('isNinjaError helper (M2)', () => {
  it('retorna true para NinjaError', () => {
    expect(isNinjaError(new NinjaError('X', 'm', 'runtime'))).toBe(true);
  });
  it('retorna true para subclase', () => {
    expect(isNinjaError(new LLMError('X', 'm'))).toBe(true);
  });
  it('retorna false para Error nativo', () => {
    expect(isNinjaError(new Error('x'))).toBe(false);
  });
  it('retorna false para string, null, undefined', () => {
    expect(isNinjaError('string')).toBe(false);
    expect(isNinjaError(null)).toBe(false);
    expect(isNinjaError(undefined)).toBe(false);
  });
});

describe('wrapUnknown helper (M1)', () => {
  it('preserva cause al envolver un Error nativo', () => {
    const inner = new Error('boom');
    const wrapped = wrapUnknown(inner, 'LLM_CALL_FAILED', 'llm');
    expect(wrapped).toBeInstanceOf(NinjaError);
    expect(wrapped.cause).toBe(inner);
    expect(wrapped.code).toBe('LLM_CALL_FAILED');
    expect(wrapped.domain).toBe('llm');
    expect(wrapped.message).toBe('boom');
  });

  it('retorna el mismo objeto si ya es NinjaError', () => {
    const orig = new VaultError('VAULT_X', 'already ninja');
    const result = wrapUnknown(orig, 'WHATEVER', 'runtime');
    expect(result).toBe(orig);
  });

  it('envuelve strings y primitivos', () => {
    const wrapped = wrapUnknown('error string', 'LLM_SERVER', 'llm');
    expect(wrapped).toBeInstanceOf(NinjaError);
    expect(wrapped.message).toBe('error string');
  });

  it('envuelve objetos no-Error', () => {
    const wrapped = wrapUnknown({ status: 500 }, 'LLM_SERVER', 'llm');
    expect(wrapped).toBeInstanceOf(NinjaError);
  });
});

// ─────────────────────────────────────────────────────────
// 1.5 — toJSON sanitization (M4 PII + M5 stack + M6 cause)
// ─────────────────────────────────────────────────────────
describe('NinjaError.toJSON', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('incluye stack en development', () => {
    const e = new NinjaError('X', 'm', 'runtime');
    expect(e.toJSON().stack).toBeTypeOf('string');
  });

  it('omite stack en production (M5)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const e = new NinjaError('X', 'm', 'runtime');
    const json = e.toJSON();
    expect(json).not.toHaveProperty('stack');
  });

  it('trunca stack a máx 20 líneas en development (M5)', () => {
    const e = new NinjaError('X', 'm', 'runtime');
    e.stack = Array.from({ length: 50 }, (_, i) => `at line ${i}`).join('\n');
    const lines = (e.toJSON().stack as string).split('\n');
    expect(lines.length).toBeLessThanOrEqual(20);
  });

  it('redacta PII en context: apiKey, authorization, token, password (M4)', () => {
    const e = new NinjaError('X', 'm', 'runtime', {
      context: {
        apiKey: 'sk-real-key-12345',
        authorization: 'Bearer supersecret',
        token: 'abc123',
        user: 'juan',
        requestId: 'req-001',
      },
    });
    const json = e.toJSON();
    expect(json.context).toMatchObject({
      apiKey: '[REDACTED]',
      authorization: '[REDACTED]',
      token: '[REDACTED]',
      user: 'juan',
      requestId: 'req-001',
    });
  });

  it('redacta PII de forma case-insensitive (M4)', () => {
    const e = new NinjaError('X', 'm', 'runtime', {
      context: { ApiKey: 'value', PASSWORD: 'pass', Secret: 'shhh' },
    });
    const ctx = e.toJSON().context as Record<string, unknown>;
    expect(ctx['ApiKey']).toBe('[REDACTED]');
    expect(ctx['PASSWORD']).toBe('[REDACTED]');
    expect(ctx['Secret']).toBe('[REDACTED]');
  });

  it('serializa cause NinjaError de forma recursiva hasta depth 3 (M6)', () => {
    const a = new LLMError('LLM_TIMEOUT', 'nivel 1');
    const b = new EngineError('ENGINE_PLAN_FAILED', 'nivel 2', { cause: a });
    const c = new NinjaError('TOP', 'nivel 3', 'runtime', { cause: b });
    const json = c.toJSON();
    const causeB = json.cause as Record<string, unknown>;
    expect(causeB.code).toBe('ENGINE_PLAN_FAILED');
    const causeA = causeB.cause as Record<string, unknown>;
    expect(causeA.code).toBe('LLM_TIMEOUT');
  });

  it('trunca cause chain a depth 3 (M6)', () => {
    const a = new Error('a');
    const b = new NinjaError('B', 'b', 'runtime', { cause: a });
    const c = new NinjaError('C', 'c', 'runtime', { cause: b });
    const d = new NinjaError('D', 'd', 'runtime', { cause: c });
    const e = new NinjaError('E', 'e', 'runtime', { cause: d });
    const json = e.toJSON();
    // depth 3 máximo — el 4to nivel debe ser truncado
    let current = json.cause as Record<string, unknown> | undefined;
    let depth = 0;
    while (current && typeof current === 'object' && current.code) {
      current = current.cause as Record<string, unknown> | undefined;
      depth++;
      if (depth > 10) break; // safety
    }
    expect(depth).toBeLessThanOrEqual(3);
  });

  it('serializa cause Error nativo con name+message', () => {
    const inner = new Error('inner error');
    const e = new NinjaError('X', 'outer', 'runtime', { cause: inner });
    const json = e.toJSON();
    const cause = json.cause as Record<string, unknown>;
    expect(cause.name).toBe('Error');
    expect(cause.message).toBe('inner error');
  });

  it('JSON.stringify usa toJSON automáticamente', () => {
    const e = new NinjaError('MY_CODE', 'mensaje', 'engine', { httpStatus: 500 });
    const parsed = JSON.parse(JSON.stringify(e));
    expect(parsed).toMatchObject({
      name: 'NinjaError',
      code: 'MY_CODE',
      domain: 'engine',
      message: 'mensaje',
      httpStatus: 500,
    });
  });

  it('incluye solo campos definidos (sin undefined en output)', () => {
    const e = new NinjaError('X', 'm', 'runtime');
    const json = e.toJSON();
    expect(json).not.toHaveProperty('httpStatus');
    expect(json).not.toHaveProperty('suggestion');
    expect(json).not.toHaveProperty('context');
    expect(json).not.toHaveProperty('cause');
  });
});
