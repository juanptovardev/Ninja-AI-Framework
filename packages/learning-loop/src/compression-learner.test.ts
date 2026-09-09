/**
 * Tests del CompressionLearner (T5.3, D3).
 *
 * Heurística de estrategia: ratio>0.6 && quality>0.8 → aggressive;
 * ratio>0.4 && quality>0.6 → balanced; resto → minimal.
 * Emite learning.compression.pattern.learned al alcanzar minSamplesForEmit.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eventBus } from '@ninja/events';
import { setGlobalLogLevel } from '@ninja/logging';
import type { LogLevel } from '@ninja/logging';
import { MockEventBus } from '../../../tests/helpers/mock-event-bus.js';
import { CompressionLearner } from './compression-learner.js';
import type { CompressionStats } from './schema.js';

/** getStats con narrowing estricto: falla el test si es undefined. */
function mustStats(l: CompressionLearner, taskType: string): CompressionStats {
  const stats = l.getStats(taskType);
  if (!stats) {
    expect.fail(`getStats('${taskType}') devolvió undefined`);
  }
  return stats;
}

describe('CompressionLearner — estadísticas y estrategia recomendada', () => {
  let learner: CompressionLearner;
  let mockEventBus: MockEventBus;
  let prevLogLevel: LogLevel;

  beforeEach(() => {
    prevLogLevel = 'info';
    setGlobalLogLevel('error');
    mockEventBus = new MockEventBus();
    learner = new CompressionLearner(mockEventBus as unknown as typeof eventBus, 3);
  });

  afterEach(() => {
    mockEventBus.clear();
    setGlobalLogLevel(prevLogLevel);
  });

  it('sin datos → estrategia default balanced', () => {
    expect(learner.getBestStrategy('inexistente')).toBe('balanced');
    expect(learner.getStats('inexistente')).toBeUndefined();
  });

  it('ratio>0.6 y quality>0.8 → aggressive; solo hay que cruzar los umbrales en promedio', () => {
    learner.record('docs', 0.8, 0.9);
    expect(learner.getBestStrategy('docs')).toBe('aggressive');
    const stats = mustStats(learner, 'docs');
    expect(stats.sampleCount).toBe(1);
    expect(stats.avgRatio).toBeCloseTo(0.8, 5);
    expect(stats.avgQuality).toBeCloseTo(0.9, 5);
  });

  it('ratio 0.5, quality 0.7 → balanced; ratio 0.2, quality 0.3 → minimal', () => {
    learner.record('code', 0.5, 0.7);
    expect(learner.getBestStrategy('code')).toBe('balanced');

    learner.record('chat', 0.2, 0.3);
    expect(learner.getBestStrategy('chat')).toBe('minimal');
  });

  it('el promedio decide: observaciones mixtas balanced + minimal → minimal', () => {
    learner.record('mixed', 0.5, 0.7);
    learner.record('mixed', 0.1, 0.3);

    // avgRatio = 0.3 (<= 0.4) → minimal aunque una observación fue balanced
    expect(learner.getBestStrategy('mixed')).toBe('minimal');
    const stats = mustStats(learner, 'mixed');
    expect(stats.sampleCount).toBe(2);
    expect(stats.avgRatio).toBeCloseTo(0.3, 5);
    expect(stats.avgQuality).toBeCloseTo(0.5, 5);
  });

  it('ratio/quality fuera de [0,1] → observación rechazada (sin stats, sin cambios)', () => {
    learner.record('valid', 0.5, 0.7);
    learner.record('valid', 1.5, 0.5);
    learner.record('valid', 0.5, -0.1);

    const stats = mustStats(learner, 'valid');
    expect(stats.sampleCount).toBe(1);
    expect(stats.avgRatio).toBeCloseTo(0.5, 5);
  });

  it('clear(taskType) borra solo ese tipo; clear() borra todo', () => {
    learner.record('a', 0.5, 0.7);
    learner.record('b', 0.5, 0.7);

    learner.clear('a');
    expect(learner.getStats('a')).toBeUndefined();
    expect(learner.getBestStrategy('a')).toBe('balanced');
    expect(learner.getStats('b')).toBeDefined();

    learner.clear();
    expect(learner.getStats('b')).toBeUndefined();
  });

  it('sampleCount >= minSamplesForEmit → emite learning.compression.pattern.learned con confianza', () => {
    for (let i = 0; i < 3; i++) {
      learner.record('emit', 0.8, 0.9);
    }

    // minSamplesForEmit = 3 → solo la 3ª observación cruza el umbral → 1 evento
    const events = mockEventBus.getEvents('learning.compression.pattern.learned');
    expect(events).toHaveLength(1);
    const payload = events[0].payload as {
      taskType: string;
      strategy: string;
      sampleCount: number;
      confidence: number;
    };
    expect(payload.taskType).toBe('emit');
    expect(payload.strategy).toBe('aggressive');
    expect(payload.sampleCount).toBe(3);
    expect(payload.confidence).toBeCloseTo(3 / 100, 5);
  });

  it('por debajo del mínimo NO emite evento', () => {
    learner.record('quiet', 0.8, 0.9);
    learner.record('quiet', 0.8, 0.9);

    expect(mockEventBus.getEvents('learning.compression.pattern.learned')).toHaveLength(0);
  });
});
