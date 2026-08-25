import { describe, it, expect, beforeEach } from 'vitest';
import { ModelSelector, KeyRotator } from './selector.js';
import { ModelCatalog } from './catalog.js';
import { MockEventBus } from '../../../tests/helpers/mock-event-bus.js';
import type { ModelEntry } from './schema.js';

class MockModelCatalog {
  private models: ModelEntry[] = [];

  setModels(models: ModelEntry[]): void {
    this.models = models;
  }

  getByCapability(capability: string): ModelEntry[] {
    return this.models.filter((m) => m.capabilities.includes(capability as any));
  }

  getById(id: string): ModelEntry | undefined {
    return this.models.find((m) => m.id === id);
  }

  getAvailable(): ModelEntry[] {
    return this.models.filter((m) => m.isAvailable);
  }

  getApiKeys(provider: string): string[] {
    if (provider === 'openai') return ['key1', 'key2'];
    if (provider === 'anthropic') return ['key-anthropic'];
    return [];
  }

  filterByAvailableKeys(): ModelEntry[] {
    return this.models.filter((m) => m.provider === 'ollama' || this.getApiKeys(m.provider).length > 0);
  }
}

describe('ModelSelector', () => {
  let mockCatalog: MockModelCatalog;
  let mockEventBus: MockEventBus;
  let selector: ModelSelector;

  const codeModels: ModelEntry[] = [
    {
      id: 'fast-model',
      provider: 'ollama',
      name: 'Fast',
      tier: 'free',
      contextWindow: 8000,
      capabilities: ['code', 'chat'],
      costPerToken: 0,
      isAvailable: true,
      quotaRemaining: Infinity,
      lastPing: 500,
      intelligenceScore: 80,
    },
    {
      id: 'capable-model',
      provider: 'openai',
      name: 'Capable',
      tier: 'paid',
      contextWindow: 128000,
      capabilities: ['code', 'reasoning', 'chat', 'vision'],
      costPerToken: 0.000003,
      isAvailable: true,
      quotaRemaining: 500000,
      lastPing: 100,
      intelligenceScore: 95,
    },
    {
      id: 'cheap-model',
      provider: 'meta',
      name: 'Cheap',
      tier: 'free',
      contextWindow: 32000,
      capabilities: ['code', 'chat'],
      costPerToken: 0,
      isAvailable: true,
      quotaRemaining: Infinity,
      lastPing: 200,
      intelligenceScore: 50,
    },
  ];

  beforeEach(() => {
    mockCatalog = new MockModelCatalog();
    mockEventBus = new MockEventBus();
    selector = new ModelSelector(mockCatalog as any, mockEventBus as any);
  });

  describe('select', () => {
    it('strategy=fastest selecciona por lastPing', () => {
      mockCatalog.setModels(codeModels);

      const result = selector.select({
        capability: 'code',
        strategy: 'fastest',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // WP-B9: "fastest" = menor lastPing. capable-model (100ms) es más rápido que
        // fast-model (500ms) y cheap-model (200ms). El test previo asertaba el output del bug.
        expect(result.data.modelId).toBe('capable-model');
      }
    });

    it('strategy=cheapest selecciona por costPerToken', () => {
      mockCatalog.setModels(codeModels);

      const result = selector.select({
        capability: 'code',
        strategy: 'cheapest',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.modelId).toBe('fast-model');
      }
    });

    it('strategy=most-capable selecciona por contextWindow+capabilities', () => {
      mockCatalog.setModels(codeModels);

      const result = selector.select({
        capability: 'code',
        strategy: 'most-capable',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.modelId).toBe('capable-model');
      }
    });

    it('strategy=balanced usa score ponderado', () => {
      mockCatalog.setModels(codeModels);

      const result = selector.select({
        capability: 'code',
        strategy: 'balanced',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.modelId).toBeDefined();
      }
    });

    it('strategy=premium selecciona por intelligenceScore', () => {
      mockCatalog.setModels(codeModels);

      const result = selector.select({
        capability: 'code',
        strategy: 'premium',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.modelId).toBe('capable-model'); // Tiene intelligenceScore: 95
      }
    });

    it('strategy=high-efficiency selecciona por ratio contextWindow/ping', () => {
      mockCatalog.setModels(codeModels);

      const result = selector.select({
        capability: 'code',
        strategy: 'high-efficiency',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.modelId).toBe('capable-model'); // 128000 / 100 = 1280
      }
    });

    it('KeyRotator devuelve keys en round-robin', () => {
      const rotator = new KeyRotator(mockCatalog as any);
      expect(rotator.getNextKey('openai')).toBe('key1');
      expect(rotator.getNextKey('openai')).toBe('key2');
      expect(rotator.getNextKey('openai')).toBe('key1');
    });

    it('KeyRotator maneja providers sin keys', () => {
      const rotator = new KeyRotator(mockCatalog as any);
      expect(rotator.getNextKey('meta')).toBeUndefined();
    });

    it('KeyRotator ignora provider ollama', () => {
      const rotator = new KeyRotator(mockCatalog as any);
      expect(rotator.getNextKey('ollama')).toBeUndefined();
    });

    it('fallback cuando ningún modelo tiene la capability', () => {
      mockCatalog.setModels([]);

      const result = selector.select({
        capability: 'embedding',
        strategy: 'balanced',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NO_CAPABILITY_MATCH');
      }
    });

    it('fallback cuando modelos no están disponibles', () => {
      const unavailableModels: ModelEntry[] = codeModels.map((m) => ({
        ...m,
        isAvailable: false,
      }));
      mockCatalog.setModels(unavailableModels);

      const result = selector.select({
        capability: 'code',
        strategy: 'fastest',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NO_MODELS_AVAILABLE');
      }
    });

    it('fallback cuando quota se agotó', () => {
      const exhaustedModels: ModelEntry[] = codeModels.map((m) => ({
        ...m,
        quotaRemaining: 0,
      }));
      mockCatalog.setModels(exhaustedModels);

      const result = selector.select({
        capability: 'code',
        strategy: 'balanced',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('QUOTA_EXHAUSTED');
      }
    });

    it('emite model.selected en selección exitosa', () => {
      mockCatalog.setModels(codeModels);

      selector.select({
        capability: 'code',
        strategy: 'balanced',
      });

      const events = mockEventBus.getEvents('model.selected');
      expect(events).toHaveLength(1);
      if (events[0]) {
        expect(events[0].payload).toMatchObject({
          strategy: 'balanced',
          confidence: expect.any(Number),
        });
      }
    });

    it('emite model.gateway.exhausted en fallo', () => {
      mockCatalog.setModels([]);

      selector.select({
        capability: 'embedding',
        strategy: 'balanced',
      });

      const events = mockEventBus.getEvents('model.gateway.exhausted');
      expect(events).toHaveLength(1);
    });

    it('confianza base 0.7 con bonus por disponibilidad', () => {
      mockCatalog.setModels(codeModels);

      const result = selector.select({
        capability: 'code',
        strategy: 'balanced',
      });

      if (result.success) {
        expect(result.data.confidence).toBeGreaterThanOrEqual(0.7);
        expect(result.data.confidence).toBeLessThanOrEqual(1.0);
      }
    });
  });

  describe('selectFastest (WP-B9)', () => {
    const makeModel = (id: string, lastPing?: number): ModelEntry => ({
      id,
      provider: 'ollama',
      name: id,
      tier: 'free',
      contextWindow: 8000,
      capabilities: ['code'],
      costPerToken: 0,
      isAvailable: true,
      quotaRemaining: Infinity,
      intelligenceScore: 70,
      ...(lastPing !== undefined ? { lastPing } : {}),
    });

    it('elige el modelo con menor ping de entre {200, 50, 120}', () => {
      mockCatalog.setModels([makeModel('slow', 200), makeModel('fast', 50), makeModel('mid', 120)]);
      const result = selector.select({ capability: 'code', strategy: 'fastest' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.modelId).toBe('fast');
    });

    it('modelo sin ping no se prioriza sobre modelo con ping medido', () => {
      mockCatalog.setModels([makeModel('no-ping'), makeModel('with-ping', 100)]);
      const result = selector.select({ capability: 'code', strategy: 'fastest' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.modelId).toBe('with-ping');
    });

    it('todos sin ping → devuelve el primero (Infinity === Infinity, reduce mantiene best)', () => {
      mockCatalog.setModels([makeModel('first'), makeModel('second'), makeModel('third')]);
      const result = selector.select({ capability: 'code', strategy: 'fastest' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.modelId).toBe('first');
    });
  });
});
