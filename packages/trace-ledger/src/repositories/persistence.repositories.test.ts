/**
 * Tests de PulseMetricRepository y AuditLogRepository (WP-C4b / F2.5).
 * Patrón del repo (agent-commit.test.ts): initDb(':memory:') + CREATE TABLE inline
 * (el esquema real se valida en workspace-migrations.test.ts de @ninja/workbench).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { initDb } from '@ninja/storage';
import type { Database } from '@ninja/storage';
import { PulseMetricRepository } from './pulse-metric.repository.js';
import { AuditLogRepository } from './audit-log.repository.js';

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

const AUDIT_LOG_DDL = `
  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    result TEXT NOT NULL,
    detail TEXT
  );
`;

describe('PulseMetricRepository (WP-C4b)', () => {
  let db: Database.Database;
  let repo: PulseMetricRepository;

  beforeEach(() => {
    db = initDb(':memory:');
    db.exec(PULSE_METRICS_DDL);
    repo = new PulseMetricRepository(db);
  });

  it('insert + findByMetric (desc) + autoincrement', () => {
    repo.insert({ metric: 'stability_score', value: 90, capturedAt: '2026-09-07T10:00:00.000Z' });
    repo.insert({ metric: 'stability_score', value: 85, capturedAt: '2026-09-07T10:01:00.000Z' });
    repo.insert({ metric: 'stability_score', value: 95, capturedAt: '2026-09-07T10:02:00.000Z' });
    repo.insert({ metric: 'llm_latency_ms', value: 420, capturedAt: '2026-09-07T10:02:30.000Z' });

    const rows = repo.findByMetric('stability_score');
    expect(rows.length).toBe(3);
    expect(rows[0].value).toBe(95); // más reciente primero
    expect(rows[2].value).toBe(90);
    expect(rows[0].id).toBeGreaterThan(0);

    const withContext = repo.insert({ metric: 'ctx', value: 1, context: '{"agentId":"a1"}' });
    expect(JSON.parse(withContext.context ?? '{}')).toEqual({ agentId: 'a1' });
  });

  it('findByRange filtra por rango ISO', () => {
    repo.insert({ metric: 'm', value: 1, capturedAt: '2026-09-07T09:00:00.000Z' });
    repo.insert({ metric: 'm', value: 2, capturedAt: '2026-09-07T11:00:00.000Z' });
    repo.insert({ metric: 'm', value: 3, capturedAt: '2026-09-07T12:00:00.000Z' });

    const rows = repo.findByRange('2026-09-07T10:00:00.000Z', '2026-09-07T12:30:00.000Z');
    expect(rows.map((r) => r.value)).toEqual([2, 3]); // asc
  });

  it('aggregateByMetric agrupa count/avg/min/max por métrica', () => {
    repo.insert({ metric: 'stability_score', value: 80, capturedAt: '2026-09-07T10:00:00.000Z' });
    repo.insert({ metric: 'stability_score', value: 90, capturedAt: '2026-09-07T10:01:00.000Z' });
    repo.insert({ metric: 'llm_latency_ms', value: 100, capturedAt: '2026-09-07T10:02:00.000Z' });

    const agg = repo.aggregateByMetric('2026-09-07T00:00:00.000Z', '2026-09-08T00:00:00.000Z');
    expect(agg.length).toBe(2);

    const stability = agg.find((a) => a.metric === 'stability_score');
    expect(stability).toEqual({ metric: 'stability_score', count: 2, avg: 85, min: 80, max: 90 });
  });

  it('mapRow roundtrip', () => {
    const inserted = repo.insert({ metric: 'm', value: 42 });
    const raw = db.prepare('SELECT * FROM pulse_metrics WHERE id = ?').get(inserted.id);
    expect(repo.mapRow(raw)).toEqual(inserted);
  });
});

describe('AuditLogRepository (WP-C4b)', () => {
  let db: Database.Database;
  let repo: AuditLogRepository;

  beforeEach(() => {
    db = initDb(':memory:');
    db.exec(AUDIT_LOG_DDL);
    repo = new AuditLogRepository(db);
  });

  it('insert + findByActor + roundtrip mapRow', () => {
    const e1 = repo.insert({
      actor: 'agent-architect',
      action: 'shell.execute',
      target: 'run-1',
      result: 'blocked',
      detail: 'policy: block external execution',
      createdAt: '2026-09-07T10:00:00.000Z',
    });
    const e2 = repo.insert({
      actor: 'operator-abc123',
      action: 'approval',
      result: 'approved',
      createdAt: '2026-09-07T10:05:00.000Z',
    });

    expect(e1.id).toBeGreaterThan(0);
    expect(e2.target).toBeNull();

    const byActor = repo.findByActor('agent-architect');
    expect(byActor.length).toBe(1);
    expect(byActor[0].result).toBe('blocked');

    const raw = db.prepare('SELECT * FROM audit_log WHERE id = ?').get(e1.id);
    expect(repo.mapRow(raw)).toEqual(e1);
  });

  it('findByRange con y sin filtro de action', () => {
    repo.insert({
      actor: 'a',
      action: 'block',
      result: 'blocked',
      createdAt: '2026-09-07T10:00:00.000Z',
    });
    repo.insert({
      actor: 'a',
      action: 'approval',
      result: 'approved',
      createdAt: '2026-09-07T11:00:00.000Z',
    });
    repo.insert({
      actor: 'a',
      action: 'block',
      result: 'allowed',
      createdAt: '2026-09-07T12:00:00.000Z',
    });

    const all = repo.findByRange('2026-09-07T00:00:00.000Z', '2026-09-08T00:00:00.000Z');
    expect(all.length).toBe(3);

    const blocks = repo.findByRange(
      '2026-09-07T00:00:00.000Z',
      '2026-09-08T00:00:00.000Z',
      'block'
    );
    expect(blocks.map((r) => r.result)).toEqual(['blocked', 'allowed']);
  });
});
