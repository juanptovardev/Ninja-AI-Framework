/**
 * Tests del LearningPromoter (T5.3, D3).
 *
 * Criterio del plan: aplica el umbral de promoción del EvaluationReport y
 * persiste en Engram. Estrategia de test: FAKE en memoria con la semántica
 * observable necesaria (NO el cliente real) por cumplimiento de capas —
 * Manual §4.2: L2 (learning-loop) no importa L3 (integrations-engram), ni
 * siquiera como tipo (la regla no-restricted-imports lo prohíbe). El tipo
 * estructural se deriva del propio SUT (ConstructorParameters), sin duplicar
 * contratos ni importar el módulo prohibido.
 * eventBus mockeado con tests/helpers/mock-event-bus.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ok, err } from '@ninja/contracts';
import type { Result } from '@ninja/contracts';
import { eventBus } from '@ninja/events';
import { setGlobalLogLevel } from '@ninja/logging';
import type { LogLevel } from '@ninja/logging';
import { MockEventBus } from '../../../tests/helpers/mock-event-bus.js';
import { LearningPromoter } from './promoter.js';
import type { LearningCandidate, EvaluationReport } from './schema.js';

/** Puerto estructural que LearningPromoter exige — derivado del SUT, sin importar L3. */
type EngramPort = ConstructorParameters<typeof LearningPromoter>[0];

/** Entrada de memoria mínima con la forma que estos tests observan. */
interface FakeEntry {
  id: string;
  sessionId: string;
  agentId?: string;
  content: string;
  compressed: boolean;
  tokenCount: number;
  timestamp: string;
  tags: string[];
}

/**
 * Fake en memoria de EngramClient con la semántica mínima que estos tests
 * necesitan: store por sessionId conocida, error de FK ante desconocida,
 * retrieve por sessionId. Determinista, sin SQLite.
 */
class FakeEngramClient {
  private readonly knownSessions: Set<string>;
  private readonly storeBySession = new Map<string, FakeEntry[]>();
  private seq = 0;

  constructor(knownSessions: string[] = ['run-promo-1']) {
    this.knownSessions = new Set(knownSessions);
  }

  async store(entry: Omit<FakeEntry, 'id'>): Promise<Result<FakeEntry, Error>> {
    if (!this.knownSessions.has(entry.sessionId)) {
      return err(new Error('Failed to store memory: FOREIGN KEY constraint failed (sessions)'));
    }
    const saved: FakeEntry = { ...entry, id: `mem-${++this.seq}` };
    const list = this.storeBySession.get(entry.sessionId) ?? [];
    list.push(saved);
    this.storeBySession.set(entry.sessionId, list);
    return ok(saved);
  }

  async retrieve(query: { sessionId: string }): Promise<Result<FakeEntry[], Error>> {
    return ok([...(this.storeBySession.get(query.sessionId) ?? [])]);
  }
}

function makeReport(overrides: Partial<EvaluationReport> = {}): EvaluationReport {
  return {
    candidateId: 'run-promo-1',
    criteria: [
      { name: 'output_completeness', score: 100, weight: 0.4 },
      { name: 'execution_speed', score: 100, weight: 0.3 },
      { name: 'token_efficiency', score: 100, weight: 0.3 },
    ],
    totalScore: 100,
    recommendPromotion: true,
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<LearningCandidate> = {}): LearningCandidate {
  return {
    runId: 'run-promo-1',
    agentId: 'agent-1',
    taskType: 'build',
    result: 'export function promoted() { return 42; }',
    qualityScore: 100,
    ...overrides,
  };
}

describe('LearningPromoter — umbral + persistencia en Engram', () => {
  let engram: FakeEngramClient;
  let promoter: LearningPromoter;
  let mockEventBus: MockEventBus;
  let prevLogLevel: LogLevel;

  beforeEach(() => {
    prevLogLevel = 'info';
    setGlobalLogLevel('error');
    engram = new FakeEngramClient();
    mockEventBus = new MockEventBus();
    promoter = new LearningPromoter(
      engram as unknown as EngramPort,
      mockEventBus as unknown as typeof eventBus
    );
  });

  afterEach(() => {
    mockEventBus.clear();
    setGlobalLogLevel(prevLogLevel);
  });

  it('reporte recomendado → guarda MemoryEntry en Engram con tags promoted-template + taskType', async () => {
    const result = await promoter.promote(makeReport(), makeCandidate());

    expect(result.success).toBe(true);
    const stored = await engram.retrieve({ sessionId: 'run-promo-1' });
    if (!stored.success) {
      expect.fail(`retrieve falló: ${stored.error.message}`);
    }
    expect(stored.data).toHaveLength(1);

    const entry = stored.data[0];
    expect(entry.agentId).toBe('agent-1');
    expect(entry.compressed).toBe(false);
    expect(entry.tags).toContain('promoted-template');
    expect(entry.tags).toContain('build');
    expect(entry.tokenCount).toBe(Math.ceil(entry.content.length / 4));

    const parsed = JSON.parse(entry.content) as {
      taskType: string;
      result: string;
      evaluation: { totalScore: number; criteria: unknown[] };
    };
    expect(parsed.taskType).toBe('build');
    expect(parsed.result).toBe('export function promoted() { return 42; }');
    expect(parsed.evaluation.totalScore).toBe(100);
    expect(parsed.evaluation.criteria).toHaveLength(3);
  });

  it('reporte NO recomendado → no persiste nada y no emite evento (umbral respetado)', async () => {
    const result = await promoter.promote(
      makeReport({ recommendPromotion: false, totalScore: 40 }),
      makeCandidate()
    );

    expect(result.success).toBe(true);
    const stored = await engram.retrieve({ sessionId: 'run-promo-1' });
    if (!stored.success) {
      expect.fail(`retrieve falló: ${stored.error.message}`);
    }
    expect(stored.data).toHaveLength(0);
    expect(mockEventBus.getEvents('learning.candidate.promoted')).toHaveLength(0);
  });

  it('promoción exitosa emite learning.candidate.promoted con payload completo', async () => {
    await promoter.promote(makeReport(), makeCandidate());

    const events = mockEventBus.getEvents('learning.candidate.promoted');
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe('learning-loop');
    const payload = events[0].payload as {
      candidateId: string;
      taskType: string;
      runId: string;
      agentId: string;
    };
    expect(payload).toEqual({
      candidateId: 'run-promo-1',
      taskType: 'build',
      runId: 'run-promo-1',
      agentId: 'agent-1',
    });
  });

  it('fallo del store de Engram → err() con el error propagado y sin evento', async () => {
    // sessionId desconocido para el fake → simula FK violation del store real.
    const orphan = makeCandidate({ runId: 'no-existe' });
    const result = await promoter.promote(makeReport({ candidateId: 'no-existe' }), orphan);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toContain('Failed to store memory');
    }
    expect(mockEventBus.getEvents('learning.candidate.promoted')).toHaveLength(0);
  });

  it('store() que lanza excepción inesperada → err() con "Promotion failed" (catch superior)', async () => {
    const exploding = {
      store: () => {
        throw new Error('disk on fire');
      },
    } as unknown as EngramPort;
    const brokenPromoter = new LearningPromoter(
      exploding,
      mockEventBus as unknown as typeof eventBus
    );

    const result = await brokenPromoter.promote(makeReport(), makeCandidate());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('Promotion failed: disk on fire');
    }
    expect(mockEventBus.getEvents('learning.candidate.promoted')).toHaveLength(0);
  });
});
