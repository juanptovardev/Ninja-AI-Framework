/**
 * @ninja/kage-runtime — env-schema.test.ts
 * TDD tests for EnvSchema validation (WP-B2)
 * ADR: docs/adr/0004-env-validation-strategy.md
 */
import { describe, it, expect } from 'vitest';
import { parseEnv, EnvSchema } from '../env-schema.js';

const VALID_BASE = {
  LLM_BASE_URL: 'https://api.openai.com/v1',
  LLM_API_KEY: 'sk-valid-key-12345',
  LLM_DEFAULT_MODEL: 'gpt-4o-mini',
};

describe('EnvSchema — valid cases', () => {
  it('acepta env válida y aplica defaults', () => {
    const env = parseEnv(VALID_BASE);
    expect(env.LLM_BASE_URL).toBe('https://api.openai.com/v1');
    expect(env.LLM_API_KEY).toBe('sk-valid-key-12345');
    expect(env.LLM_DEFAULT_MODEL).toBe('gpt-4o-mini');
    expect(env.LLM_PROVIDER).toBe('openai');
    expect(env.NINJA_RUNTIME_PORT).toBe(3141);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.NODE_ENV).toBe('development');
    expect(env.NINJA_LLM_FAIL_MODE).toBe('strict');
    expect(env.LIGHTRAG_API_URL).toBeUndefined();
  });

  it('acepta puerto personalizado como string (coerced)', () => {
    const env = parseEnv({ ...VALID_BASE, NINJA_RUNTIME_PORT: '8080' });
    expect(env.NINJA_RUNTIME_PORT).toBe(8080);
  });

  it('acepta LIGHTRAG_API_URL opcional', () => {
    const env = parseEnv({ ...VALID_BASE, LIGHTRAG_API_URL: 'http://localhost:9621' });
    expect(env.LIGHTRAG_API_URL).toBe('http://localhost:9621');
  });

  it('acepta NINJA_LLM_FAIL_MODE=legacy', () => {
    const env = parseEnv({ ...VALID_BASE, NINJA_LLM_FAIL_MODE: 'legacy' });
    expect(env.NINJA_LLM_FAIL_MODE).toBe('legacy');
  });

  it('acepta NINJA_SESSION_TOKEN_BUDGET=5000 → número 5000', () => {
    const env = parseEnv({ ...VALID_BASE, NINJA_SESSION_TOKEN_BUDGET: '5000' });
    expect(env.NINJA_SESSION_TOKEN_BUDGET).toBe(5000);
  });

  it('NINJA_SESSION_TOKEN_BUDGET ausente → undefined', () => {
    const env = parseEnv(VALID_BASE);
    expect(env.NINJA_SESSION_TOKEN_BUDGET).toBeUndefined();
  });

  it('acepta LOG_LEVEL enum completo', () => {
    for (const level of ['debug', 'info', 'warn', 'error', 'silent']) {
      expect(() => parseEnv({ ...VALID_BASE, LOG_LEVEL: level })).not.toThrow();
    }
  });
});

describe('EnvSchema — validation failures', () => {
  it('falta LLM_API_KEY → lanza con mensaje claro', () => {
    expect(() => parseEnv({ ...VALID_BASE, LLM_API_KEY: undefined })).toThrow();
    try {
      parseEnv({ ...VALID_BASE, LLM_API_KEY: undefined });
    } catch (e) {
      expect(String(e)).toContain('LLM_API_KEY');
    }
  });

  it('LLM_API_KEY < 8 chars → falla', () => {
    expect(() => parseEnv({ ...VALID_BASE, LLM_API_KEY: 'short' })).toThrow();
  });

  it('LLM_BASE_URL no es URL válida → falla', () => {
    expect(() => parseEnv({ ...VALID_BASE, LLM_BASE_URL: 'not-a-url' })).toThrow();
  });

  it('falta LLM_BASE_URL → falla', () => {
    expect(() => parseEnv({ ...VALID_BASE, LLM_BASE_URL: undefined })).toThrow();
  });

  it('falta LLM_DEFAULT_MODEL → falla', () => {
    expect(() => parseEnv({ ...VALID_BASE, LLM_DEFAULT_MODEL: '' })).toThrow();
  });

  it('NINJA_RUNTIME_PORT no numérico → falla', () => {
    expect(() => parseEnv({ ...VALID_BASE, NINJA_RUNTIME_PORT: 'abc' })).toThrow();
  });

  it('LOG_LEVEL fuera de enum → falla', () => {
    expect(() => parseEnv({ ...VALID_BASE, LOG_LEVEL: 'verbose' })).toThrow();
  });

  it('NINJA_LLM_FAIL_MODE valor inválido → falla', () => {
    expect(() => parseEnv({ ...VALID_BASE, NINJA_LLM_FAIL_MODE: 'aggressive' })).toThrow();
  });

  it('NODE_ENV valor inválido → falla', () => {
    expect(() => parseEnv({ ...VALID_BASE, NODE_ENV: 'staging' })).toThrow();
  });

  it('env completamente vacío → falla con múltiples issues (LLM_BASE_URL + LLM_API_KEY + LLM_DEFAULT_MODEL)', () => {
    try {
      parseEnv({});
    } catch (e) {
      const msg = String(e);
      expect(msg).toContain('LLM_BASE_URL');
      expect(msg).toContain('LLM_API_KEY');
    }
  });

  it('LIGHTRAG_API_URL inválida cuando presente → falla', () => {
    expect(() => parseEnv({ ...VALID_BASE, LIGHTRAG_API_URL: 'not-a-url' })).toThrow();
  });

  it('NINJA_SESSION_TOKEN_BUDGET=abc → falla validación', () => {
    expect(() => parseEnv({ ...VALID_BASE, NINJA_SESSION_TOKEN_BUDGET: 'abc' })).toThrow();
  });

  it('NINJA_SESSION_TOKEN_BUDGET=0 → falla (debe ser positivo)', () => {
    expect(() => parseEnv({ ...VALID_BASE, NINJA_SESSION_TOKEN_BUDGET: '0' })).toThrow();
  });
});
