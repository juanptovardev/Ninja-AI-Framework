/**
 * @ninja/model-gateway — fallback.test.ts
 * Tests for FallbackChain — catalog ID alignment and chain logic (WP-B3)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { FallbackChain } from './fallback.js';
import { ModelCatalog } from './catalog.js';

// Reset singleton between tests
beforeEach(() => {
  (FallbackChain as unknown as { instance: unknown }).instance = null;
  ModelCatalog.resetInstance();
});

describe('FallbackChain — catalog ID alignment', () => {
  it('cada ID primario en default chains existe en el catálogo', () => {
    const chain = FallbackChain.getInstance();
    const catalog = ModelCatalog.getInstance();
    const catalogIds = new Set(catalog.getAll().map((m) => m.id));

    for (const [primaryId] of chain.getAllChains()) {
      expect(catalogIds.has(primaryId), `Primary model "${primaryId}" not in catalog`).toBe(true);
    }
  });

  it('cada ID de fallback en default chains existe en el catálogo', () => {
    const chain = FallbackChain.getInstance();
    const catalog = ModelCatalog.getInstance();
    const catalogIds = new Set(catalog.getAll().map((m) => m.id));

    for (const [primaryId, fallbacks] of chain.getAllChains()) {
      for (const fbId of fallbacks) {
        expect(catalogIds.has(fbId), `Fallback "${fbId}" for "${primaryId}" not in catalog`).toBe(true);
      }
    }
  });

  it('default chains no contienen IDs legacy (sin provider prefix)', () => {
    const chain = FallbackChain.getInstance();
    const legacyIds = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'];

    for (const [primaryId, fallbacks] of chain.getAllChains()) {
      expect(legacyIds.includes(primaryId), `Primary "${primaryId}" is a legacy ID`).toBe(false);
      for (const fbId of fallbacks) {
        expect(legacyIds.includes(fbId), `Fallback "${fbId}" is a legacy ID`).toBe(false);
      }
    }
  });

  it('openai/gpt-4o tiene al menos un fallback', () => {
    const chain = FallbackChain.getInstance();
    const fallbacks = chain.getChain('openai/gpt-4o');
    expect(fallbacks).toBeDefined();
    expect(fallbacks!.length).toBeGreaterThan(0);
  });
});

describe('FallbackChain — getNext logic', () => {
  it('retorna el siguiente modelo disponible en la cadena', () => {
    const chain = FallbackChain.getInstance();
    const next = chain.getNext('openai/gpt-4o', 'rate_limit');
    expect(next).not.toBeNull();
  });

  it('retorna null cuando la cadena está vacía', () => {
    const chain = FallbackChain.getInstance();
    // Find a leaf model (empty fallback chain)
    let leafModel: string | null = null;
    for (const [id, fallbacks] of chain.getAllChains()) {
      if (fallbacks.length === 0) { leafModel = id; break; }
    }
    if (leafModel) {
      expect(chain.getNext(leafModel, 'server_error')).toBeNull();
    }
  });

  it('no repite modelos ya agotados en la misma sesión', () => {
    const chain = FallbackChain.getInstance();
    const sessionId = 'test-session-123';
    const first = chain.getNext('openai/gpt-4o', 'rate_limit', sessionId);
    if (first) {
      const second = chain.getNext(first, 'rate_limit', sessionId);
      if (second) {
        expect(second).not.toBe(first);
      }
    }
  });
});
