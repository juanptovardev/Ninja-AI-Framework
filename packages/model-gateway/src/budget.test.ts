import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BudgetManager } from './budget.js';
import { MockEventBus } from '../../../tests/helpers/mock-event-bus.js';
import type { TokenUsage } from '@ninja/integrations-llm';

describe('BudgetManager', () => {
  let mockEventBus: MockEventBus;
  let budgetManager: BudgetManager;

  const sessionId = 'test-session';
  const modelId = 'gpt-4';

  const createUsage = (prompt: number, completion: number): TokenUsage => ({
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
  });

  beforeEach(() => {
    BudgetManager.resetInstance();
    mockEventBus = new MockEventBus();
    budgetManager = BudgetManager.getInstance(mockEventBus as any);
    budgetManager.reset(sessionId);
  });

  afterEach(() => {
    BudgetManager.resetInstance();
  });

  describe('record + getSessionSummary', () => {
    it('acumula tokens correctamente por modelo', () => {
      budgetManager.record(sessionId, modelId, createUsage(1000, 500));
      budgetManager.record(sessionId, modelId, createUsage(2000, 1000));

      const summary = budgetManager.getSessionSummary(sessionId);

      expect(summary).toBeDefined();
      if (summary) {
        expect(summary.totalPrompt).toBe(3000);
        expect(summary.totalCompletion).toBe(1500);
        expect(summary.modelBreakdown[modelId]).toBeDefined();
        expect(summary.modelBreakdown[modelId].promptTokens).toBe(3000);
        expect(summary.modelBreakdown[modelId].completionTokens).toBe(1500);
        expect(summary.modelBreakdown[modelId].requestCount).toBe(2);
      }
    });

    it('calcula estimatedCost con pricingTable', () => {
      budgetManager.record(sessionId, 'gpt-4', createUsage(1000, 500));

      const summary = budgetManager.getSessionSummary(sessionId);

      expect(summary).toBeDefined();
      if (summary) {
        expect(summary.estimatedCost).toBeGreaterThan(0);
      }
    });

    it('modelBreakdown separa modelos', () => {
      budgetManager.record(sessionId, 'gpt-4', createUsage(1000, 500));
      budgetManager.record(sessionId, 'claude-3-haiku', createUsage(2000, 1000));

      const summary = budgetManager.getSessionSummary(sessionId);

      expect(summary).toBeDefined();
      if (summary) {
        expect(summary.modelBreakdown['gpt-4']).toBeDefined();
        expect(summary.modelBreakdown['claude-3-haiku']).toBeDefined();
        expect(Object.keys(summary.modelBreakdown).length).toBe(2);
      }
    });
  });

  describe('isOverBudget', () => {
    it('retorna true cuando total > limit', () => {
      budgetManager.setSessionBudget(sessionId, 1000);
      budgetManager.record(sessionId, modelId, createUsage(800, 500));

      const over = budgetManager.isOverBudget(sessionId, 1000);

      expect(over).toBe(true);
    });

    it('retorna false para sesión inexistente', () => {
      const over = budgetManager.isOverBudget('nonexistent-session', 1000);

      expect(over).toBe(false);
    });
  });

  describe('thresholds', () => {
    it('emite model.budget.warning al 80%', () => {
      budgetManager.setSessionBudget('warning-session', 10000);
      budgetManager.record('warning-session', modelId, createUsage(5000, 3100));

      const events = mockEventBus.getEvents('model.budget.warning');

      expect(events).toHaveLength(1);
      if (events[0]) {
        expect((events[0].payload as any).percentage).toBeGreaterThanOrEqual(80);
      }
    });

    it('emite model.budget.exceeded al 100%', () => {
      budgetManager.setSessionBudget('exceeded-session', 5000);
      budgetManager.record('exceeded-session', modelId, createUsage(3000, 3000));

      const events = mockEventBus.getEvents('model.budget.exceeded');

      expect(events).toHaveLength(1);
      if (events[0]) {
        expect(events[0].payload as any).toMatchObject({
          sessionId: 'exceeded-session',
          usage: 6000,
          limit: 5000,
        });
      }
    });

    it('eventos se emiten solo una vez', () => {
      budgetManager.setSessionBudget('once-session', 10000);
      budgetManager.record('once-session', modelId, createUsage(9000, 0));

      const warningEvents1 = mockEventBus.getEvents('model.budget.warning');
      expect(warningEvents1).toHaveLength(1);

      budgetManager.record('once-session', modelId, createUsage(500, 0));

      const warningEvents2 = mockEventBus.getEvents('model.budget.warning');
      expect(warningEvents2).toHaveLength(1);
    });
  });

  describe('setSessionBudget + reset', () => {
    it('setSessionBudget configura límite', () => {
      budgetManager.setSessionBudget(sessionId, 50000);
      budgetManager.record(sessionId, modelId, createUsage(1000, 500));

      const summary = budgetManager.getSessionSummary(sessionId);

      expect(summary).toBeDefined();
    });

    it('reset elimina session state', () => {
      budgetManager.record(sessionId, modelId, createUsage(1000, 500));

      budgetManager.reset(sessionId);

      const summary = budgetManager.getSessionSummary(sessionId);
      expect(summary).toBeUndefined();
    });
  });

  describe('getGlobalUsage', () => {
    it('agrega tokens de todas las sesiones', () => {
      budgetManager.record('session-a', 'gpt-4', createUsage(1000, 500));
      budgetManager.record('session-b', 'claude-3', createUsage(2000, 1000));

      const global = budgetManager.getGlobalUsage();

      expect(global.totalPrompt).toBe(3000);
      expect(global.totalCompletion).toBe(1500);
      expect(Object.keys(global.modelBreakdown).length).toBe(2);
    });
  });
});
