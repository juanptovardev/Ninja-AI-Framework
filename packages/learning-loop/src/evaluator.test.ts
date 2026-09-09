/**
 * Tests del LearningEvaluator (T5.3, D3).
 *
 * Criterio del plan: aplica scoring determinista con criterios ponderados
 * (output_completeness 0.4, execution_speed 0.3, token_efficiency 0.3) y
 * recomienda promoción cuando totalScore >= 70. Mismo input → mismo score.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eventBus } from '@ninja/events';
import { setGlobalLogLevel } from '@ninja/logging';
import type { LogLevel } from '@ninja/logging';
import { MockEventBus } from '../../../tests/helpers/mock-event-bus.js';
import { LearningEvaluator } from './evaluator.js';
import type { LearningCandidate, EvalCriteria } from './schema.js';

/** Resultado "ideal": 641 chars (rango óptimo 500-2000) con estructura de código y plan. */
const IDEAL_RESULT = `${'function ideal() { return 1; }\n'.repeat(20)}### pasos\n- uno\n- dos`;

function makeCandidate(overrides: Partial<LearningCandidate> = {}): LearningCandidate {
  return {
    runId: 'run-eval-1',
    agentId: 'agent-1',
    taskType: 'build',
    result: IDEAL_RESULT,
    qualityScore: 0,
    ...overrides,
  };
}

/** Criterio por nombre con narrowing estricto: falla el test si falta. */
function criterion(report: { criteria: EvalCriteria[] }, name: string): EvalCriteria {
  const found = report.criteria.find((c) => c.name === name);
  if (!found) {
    expect.fail(`criterio '${name}' no presente en el reporte`);
  }
  return found;
}

describe('LearningEvaluator — scoring determinista', () => {
  let evaluator: LearningEvaluator;
  let mockEventBus: MockEventBus;
  let prevLogLevel: LogLevel;

  beforeEach(() => {
    prevLogLevel = 'info';
    setGlobalLogLevel('error');
    mockEventBus = new MockEventBus();
    evaluator = new LearningEvaluator({ eventBus: mockEventBus as unknown as typeof eventBus });
  });

  afterEach(() => {
    mockEventBus.clear();
    setGlobalLogLevel(prevLogLevel);
  });

  it('mismo input → mismo reporte byte a byte (determinismo)', () => {
    const candidate = makeCandidate();
    const r1 = evaluator.evaluate(candidate, { executionTimeMs: 500, tokensUsed: 300 });
    const r2 = evaluator.evaluate(candidate, { executionTimeMs: 500, tokensUsed: 300 });

    expect(r1).toEqual(r2);
  });

  it('candidato ideal con contexto óptimo → score 100 y recomienda promoción', () => {
    const report = evaluator.evaluate(makeCandidate(), { executionTimeMs: 500, tokensUsed: 300 });

    expect(report.candidateId).toBe('run-eval-1');
    expect(report.totalScore).toBe(100);
    expect(report.recommendPromotion).toBe(true);

    const byName = Object.fromEntries(report.criteria.map((c) => [c.name, c]));
    expect(byName['output_completeness'].score).toBe(100);
    expect(byName['execution_speed'].score).toBe(100);
    expect(byName['token_efficiency'].score).toBe(100);
  });

  it('los 3 criterios tienen los pesos 0.4/0.3/0.3 del plan', () => {
    const report = evaluator.evaluate(makeCandidate());
    const byName = Object.fromEntries(report.criteria.map((c) => [c.name, c]));

    expect(byName['output_completeness'].weight).toBe(0.4);
    expect(byName['execution_speed'].weight).toBe(0.3);
    expect(byName['token_efficiency'].weight).toBe(0.3);
  });

  it('output_completeness sigue la fórmula exacta: escalado lineal <500 chars + bonus estructura', () => {
    const result = 'const x = 1;'.repeat(30); // 360 chars → (360/500)*100 = 72, +10 code bonus
    const report = evaluator.evaluate(makeCandidate({ result }));

    const completeness = criterion(report, 'output_completeness');
    expect(completeness.score).toBe(82);
  });

  it('output_completeness: 0 chars → score 0; rango óptimo 500-2000 → 100 + bonus; clamp a 100', () => {
    const empty = evaluator.evaluate(makeCandidate({ result: '' }));
    expect(empty.criteria[0].score).toBe(0);

    // 720 chars → base 100, +10 por estructura de código → clamp a 100
    const mid = evaluator.evaluate(makeCandidate({ result: 'const a = 1;'.repeat(60) }));
    expect(mid.criteria[0].score).toBe(100);
  });

  it('output_completeness penaliza >2000 chars (floor 20)', () => {
    const huge = 'x'.repeat(5000); // sin estructura reconocible
    const report = evaluator.evaluate(makeCandidate({ result: huge }));
    // (5000-2000)/30 = 100 → 100-100 = 0 → floor 20
    expect(report.criteria[0].score).toBe(20);
  });

  it('execution_speed: 5000ms → 55.56 según fórmula lineal', () => {
    const report = evaluator.evaluate(makeCandidate(), { executionTimeMs: 5000, tokensUsed: 300 });
    const speed = criterion(report, 'execution_speed');
    expect(speed.score).toBe(Math.round((100 - ((5000 - 1000) / 9000) * 100) * 100) / 100);
    expect(speed.score).toBe(55.56);
  });

  it('execution_speed: <1000ms → 100; >10000ms → 0; sin contexto → estimación por longitud', () => {
    const fast = evaluator.evaluate(makeCandidate(), { executionTimeMs: 500, tokensUsed: 300 });
    expect(criterion(fast, 'execution_speed').score).toBe(100);

    const slow = evaluator.evaluate(makeCandidate(), { executionTimeMs: 20000, tokensUsed: 300 });
    expect(criterion(slow, 'execution_speed').score).toBe(0);

    // Sin executionTimeMs: resultado de 641 chars → 100 - 0.641*10 = 93.59
    const estimated = evaluator.evaluate(makeCandidate());
    expect(criterion(estimated, 'execution_speed').score).toBe(93.59);
  });

  it('token_efficiency: 5000 tokens → 0; <500 → 100; estimación length/4 cuando falta contexto', () => {
    const heavy = evaluator.evaluate(makeCandidate(), { executionTimeMs: 500, tokensUsed: 5000 });
    expect(criterion(heavy, 'token_efficiency').score).toBe(0);

    const light = evaluator.evaluate(makeCandidate(), { executionTimeMs: 500, tokensUsed: 100 });
    expect(criterion(light, 'token_efficiency').score).toBe(100);

    // Result de 641 chars → ~160 tokens estimados < 500 → 100
    const estimated = evaluator.evaluate(makeCandidate());
    expect(criterion(estimated, 'token_efficiency').score).toBe(100);
  });

  it('totalScore es el promedio ponderado exacto de los 3 criterios', () => {
    const report = evaluator.evaluate(makeCandidate(), { executionTimeMs: 5000, tokensUsed: 2000 });
    const manual = report.criteria.reduce((sum, c) => sum + c.score * c.weight, 0);
    expect(report.totalScore).toBe(Math.round(manual * 100) / 100);
  });

  it('umbral de promoción: score 70 → recomienda; score 60 → no recomienda', () => {
    // Score 100*0.4 + 0*0.3 + 100*0.3 = 70 (ejecución lenta, tokens óptimos)
    const exactly70 = evaluator.evaluate(makeCandidate(), {
      executionTimeMs: 20000,
      tokensUsed: 300,
    });
    expect(exactly70.totalScore).toBe(70);
    expect(exactly70.recommendPromotion).toBe(true);

    // Bajar token_efficiency: 2000 tokens → 66.67 → total = 40 + 0 + 20 = 60
    const below = evaluator.evaluate(makeCandidate(), { executionTimeMs: 20000, tokensUsed: 2000 });
    expect(below.totalScore).toBe(60);
    expect(below.recommendPromotion).toBe(false);
  });

  it('candidato vacío y sin contexto → scores default y NO recomienda promoción', () => {
    const report = evaluator.evaluate(makeCandidate({ result: '' }));
    expect(report.totalScore).toBeLessThan(70);
    expect(report.recommendPromotion).toBe(false);
    expect(report.criteria.map((c) => c.name)).toEqual([
      'output_completeness',
      'execution_speed',
      'token_efficiency',
    ]);
  });

  it('emite learning.candidate.evaluated con candidateId/totalScore/recommended', () => {
    const report = evaluator.evaluate(makeCandidate(), { executionTimeMs: 500, tokensUsed: 300 });

    const events = mockEventBus.getEvents('learning.candidate.evaluated');
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe('learning-loop');
    const payload = events[0].payload as {
      candidateId: string;
      totalScore: number;
      recommended: boolean;
    };
    expect(payload.candidateId).toBe('run-eval-1');
    expect(payload.totalScore).toBe(report.totalScore);
    expect(payload.recommended).toBe(true);
  });
});
