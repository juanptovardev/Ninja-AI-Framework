/**
 * Test integración Pulse → pulse_metrics (WP-C4b / F2.5).
 *
 * Caso de aceptación del plan: "emitir eventos → filas en DB".
 * PulseMonitor con hook de persistencia real (PulseMetricRepository),
 * exactamente como lo cablea server.ts (composition root).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '@ninja/events';
import { initDb } from '@ninja/storage';
import type { Database } from '@ninja/storage';
import { PulseMetricRepository } from '@ninja/trace-ledger';
import { PulseMonitor } from './monitor.js';

const PULSE_METRICS_DDL = `
  CREATE TABLE pulse_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    captured_at TEXT NOT NULL,
    metric TEXT NOT NULL,
    value REAL NOT NULL,
    context TEXT
  );
  CREATE INDEX idx_pulse_metrics_metric_captured ON pulse_metrics (metric, captured_at);
`;

describe('eventos → filas en pulse_metrics (WP-C4b)', () => {
  let db: Database.Database;

  afterEach(() => {
    if (db && db.open) db.close();
  });

  it('agent.llm.called → filas llm_latency_ms/llm_tokens_used/stability_score', () => {
    db = initDb(':memory:');
    db.exec(PULSE_METRICS_DDL);
    const repo = new PulseMetricRepository(db);
    const bus = new EventBus();

    const monitor = new PulseMonitor(bus, {
      stabilityThreshold: 60,
      contextEfficiencyThreshold: 40,
      persistMetric: (entry) => repo.insert(entry),
    });
    monitor.start();

    bus.emit({
      id: 'evt-1',
      type: 'agent.llm.called',
      source: 'agent-runtime',
      timestamp: new Date().toISOString(),
      payload: {
        agentInstanceId: 'inst-1',
        agentDefinitionId: 'architect',
        role: 'Architect',
        status: 'completed',
        data: { model: 'gpt-4o-mini', tokensUsed: 320, latencyMs: 450 },
      },
    });

    const latency = repo.findByMetric('llm_latency_ms');
    expect(latency.length).toBe(1);
    expect(latency[0].value).toBe(450);
    expect(JSON.parse(latency[0].context ?? '{}').providerId).toBe('gpt-4o-mini');

    const tokens = repo.findByMetric('llm_tokens_used');
    expect(tokens.length).toBe(1);
    expect(tokens[0].value).toBe(320);

    const stability = repo.findByMetric('stability_score');
    expect(stability.length).toBe(1);

    monitor.stop();
  });

  it('agent.task.completed → fila context_efficiency_score', () => {
    db = initDb(':memory:');
    db.exec(PULSE_METRICS_DDL);
    const repo = new PulseMetricRepository(db);
    const bus = new EventBus();

    const monitor = new PulseMonitor(bus, {
      persistMetric: (entry) => repo.insert(entry),
    });
    monitor.start();

    bus.emit({
      id: 'evt-2',
      type: 'agent.task.completed',
      source: 'agent-runtime',
      timestamp: new Date().toISOString(),
      payload: {
        agentInstanceId: 'inst-2',
        agentDefinitionId: 'builder',
        role: 'Builder',
        status: 'completed',
        data: {
          taskId: 'task-1',
          result: { output: 'done', files: ['a.ts'], summary: 'ok' },
        },
      },
    });

    const rows = repo.findByMetric('context_efficiency_score');
    expect(rows.length).toBe(1);
    const ctx = JSON.parse(rows[0].context ?? '{}');
    expect(ctx.agentId).toBe('inst-2');
    expect(ctx.taskId).toBe('task-1');

    monitor.stop();
  });

  it('sin hook persistMetric → eventos en memoria, sin crash (modo legacy)', () => {
    db = initDb(':memory:');
    db.exec(PULSE_METRICS_DDL);
    const repo = new PulseMetricRepository(db);
    const bus = new EventBus();

    const monitor = new PulseMonitor(bus, { stabilityThreshold: 60 });
    monitor.start();

    bus.emit({
      id: 'evt-3',
      type: 'agent.llm.called',
      source: 'agent-runtime',
      timestamp: new Date().toISOString(),
      payload: {
        agentInstanceId: 'inst-3',
        agentDefinitionId: 'architect',
        role: 'Architect',
        status: 'completed',
        data: { model: 'gpt-4o-mini', tokensUsed: 10, latencyMs: 50 },
      },
    });

    expect(repo.findByMetric('llm_latency_ms').length).toBe(0);
    expect(monitor.getLatencyMeasurementCount()).toBe(1); // memoria intacta

    monitor.stop();
  });
});
