import { describe, it, expect } from 'vitest';

vi.stubEnv('LLM_BASE_URL', 'http://localhost:11434/v1');
vi.stubEnv('LLM_API_KEY', 'test-key');
vi.stubEnv('LLM_DEFAULT_MODEL', 'gpt-4o-mini');

import { sanitizeError } from '../sanitize-error.js';
import { NinjaError, ErrorCodes } from '@ninja/contracts';

import { vi } from 'vitest';

describe('sanitizeError (WP-B15)', () => {
  describe('con NinjaError', () => {
    const ninjaErr = new NinjaError(ErrorCodes.ENGINE_PLAN_FAILED, 'Plan failed', 'engine', {
      httpStatus: 500,
      context: { agentId: 'agent-1', internal: 'secret-value' },
    });

    it('production → devuelve message y code, sin details', () => {
      const result = sanitizeError(ninjaErr, 'production');
      expect(result.error).toBe('Plan failed');
      expect(result.code).toBe(ErrorCodes.ENGINE_PLAN_FAILED);
      expect(result.details).toBeUndefined();
    });

    it('development → devuelve message, code y details (sin stack)', () => {
      const result = sanitizeError(ninjaErr, 'development');
      expect(result.error).toBe('Plan failed');
      expect(result.code).toBe(ErrorCodes.ENGINE_PLAN_FAILED);
      expect(result.details).toBeDefined();
    });

    it('test → mismo comportamiento que development', () => {
      const result = sanitizeError(ninjaErr, 'test');
      expect(result.error).toBe('Plan failed');
      expect(result.code).toBeDefined();
    });
  });

  describe('con Error genérico', () => {
    const err = new Error('Something broke');

    it('production → error genérico, sin mensaje real', () => {
      const result = sanitizeError(err, 'production');
      expect(result.error).toBe('Internal error');
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.details).toBeUndefined();
    });

    it('development → muestra message, no stack', () => {
      const result = sanitizeError(err, 'development');
      expect(result.error).toBe('Something broke');
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.details).toBeUndefined();
    });
  });

  describe('con string u objeto desconocido', () => {
    it('production → error genérico', () => {
      const result = sanitizeError('raw string error', 'production');
      expect(result.error).toBe('Internal error');
    });

    it('development → convierte via String()', () => {
      const result = sanitizeError('raw string error', 'development');
      expect(result.error).toBe('raw string error');
    });
  });

  describe('seguridad — stack NO se filtra en producción', () => {
    it('Error genérico en producción → error es "Internal error", no contiene stack', () => {
      const err = new Error('secret internal details');
      const result = sanitizeError(err, 'production');
      expect(result.error).not.toContain('secret internal details');
      expect(JSON.stringify(result)).not.toContain('Error:');
    });
  });
});
