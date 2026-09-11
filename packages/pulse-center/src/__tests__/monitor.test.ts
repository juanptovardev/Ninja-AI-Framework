/**
 * @ninja/pulse-center — monitor.test.ts
 * TDD tests for PulseMonitor consuming latencyMs from agent.llm.called (WP-B7)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PulseMonitor } from '../monitor.js';
import { MockEventBus } from '../../../../tests/helpers/mock-event-bus.js';

function makeLLMCalledEvent(latencyMs: number, model = 'gpt-4o-mini') {
  return {
    id: crypto.randomUUID(),
    type: 'agent.llm.called' as const,
    source: 'agent-runtime',
    timestamp: new Date().toISOString(),
    payload: {
      agentInstanceId: 'inst-1',
      agentDefinitionId: 'planner',
      role: 'Planner',
      status: 'running',
      data: { model, tokensUsed: 100, latencyMs },
    },
  };
}

describe('WP-B7: PulseMonitor — stability score reflects latencyMs', () => {
  let eventBus: MockEventBus;
  let monitor: PulseMonitor;

  beforeEach(() => {
    eventBus = new MockEventBus();
    monitor = new PulseMonitor(eventBus);
    monitor.start();
  });

  afterEach(() => {
    monitor.stop();
  });

  it('baseline: no LLM calls → getStabilityScore returns undefined (no score computed yet)', () => {
    const score = monitor.getStabilityScore('gpt-4o-mini');
    // No events emitted → no score computed
    expect(score).toBeUndefined();
  });

  it('single low-latency call → score is computed and near 100', () => {
    eventBus.emit(makeLLMCalledEvent(50)); // 50ms is fast

    const score = monitor.getStabilityScore('gpt-4o-mini');
    expect(score).toBeDefined();
    // 50ms p95 → 100 - (50/20) - 0 - 0 + (100*0.1) = 100 - 2.5 + 10 = 107.5 → clamped to 100
    expect(score!.score).toBe(100);
  });

  it('high latencyMs calls (2000ms) → stability score < 100', () => {
    // Emit multiple high-latency calls to drive p95 and jitter up
    for (let i = 0; i < 5; i++) {
      eventBus.emit(makeLLMCalledEvent(2000));
    }

    const score = monitor.getStabilityScore('gpt-4o-mini');
    expect(score).toBeDefined();
    // 2000ms p95 → 100 - (2000/20) = 100 - 100 = 0 (before uptime bonus)
    expect(score!.score).toBeLessThan(100);
  });

  it('very high latencyMs calls → score is significantly degraded', () => {
    for (let i = 0; i < 3; i++) {
      eventBus.emit(makeLLMCalledEvent(2000));
    }

    const score = monitor.getStabilityScore('gpt-4o-mini');
    expect(score).toBeDefined();
    // p95 of [2000,2000,2000] = 2000 → penalty = 2000/20 = 100 → score near 0
    expect(score!.score).toBeLessThan(20);
  });

  it('emits health.score.updated event after each agent.llm.called', () => {
    eventBus.emit(makeLLMCalledEvent(100));

    const scoreEvents = eventBus.getEvents('health.score.updated');
    expect(scoreEvents.length).toBe(1);
    expect(
      (scoreEvents[0].payload as { scoreType: 'stability' | 'contextEfficiency' }).scoreType
    ).toBe('stability');
  });

  it('emits health.degradation.detected when score falls below threshold (default 60)', () => {
    // Very high latency to force score below 60
    for (let i = 0; i < 5; i++) {
      eventBus.emit(makeLLMCalledEvent(2000));
    }

    const degradationEvents = eventBus.getEvents('health.degradation.detected');
    expect(degradationEvents.length).toBeGreaterThan(0);
  });
});
