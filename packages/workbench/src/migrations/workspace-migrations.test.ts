/**
 * Tests de las migraciones 7/8 (pulse_metrics + audit_log) — WP-C4b / F2.5.
 * Gate 4: up AND down, idempotente, sobre DB temporal (:memory: vía initDb de storage).
 */
import { describe, it, expect } from 'vitest';
import { initDb, runMigrations, revertMigrations } from '@ninja/storage';
import { WORKSPACE_MIGRATIONS } from './workspace-migrations.js';

describe('migraciones 7/8 (pulse_metrics + audit_log, WP-C4b)', () => {
  it('up crea ambas tablas con índice · down las elimina · up re-aplica (idempotente)', () => {
    const db = initDb(':memory:');

    // UP completo (1..8)
    runMigrations(db, WORKSPACE_MIGRATIONS);

    const tableExists = (name: string): boolean =>
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name) !==
      undefined;
    expect(tableExists('pulse_metrics')).toBe(true);
    expect(tableExists('audit_log')).toBe(true);

    // Índice de pulse_metrics
    const idx = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_pulse_metrics_metric_captured'"
      )
      .get();
    expect(idx).toBeDefined();

    // Autoincrement INTEGER PK en ambas + tipos correctos
    db.prepare(
      'INSERT INTO pulse_metrics (captured_at, metric, value, context) VALUES (?, ?, ?, ?)'
    ).run(new Date().toISOString(), 'stability_score', 88.5, null);
    const pm = db.prepare('SELECT id, metric, value FROM pulse_metrics').all() as Array<{
      id: number;
      metric: string;
      value: number;
    }>;
    expect(pm.length).toBe(1);
    expect(pm[0].id).toBe(1);
    expect(pm[0].value).toBeCloseTo(88.5);

    db.prepare(
      'INSERT INTO audit_log (created_at, actor, action, target, result, detail) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(new Date().toISOString(), 'agent-x', 'shell.execute', 'run-1', 'blocked', 'policy');
    const al = db.prepare('SELECT id, actor, result FROM audit_log').all() as Array<{
      id: number;
      actor: string;
      result: string;
    }>;
    expect(al.length).toBe(1);
    expect(al[0].result).toBe('blocked');

    // DOWN: revierte 8 y luego 7
    expect(revertMigrations(db, WORKSPACE_MIGRATIONS).reverted).toBe(true); // 8
    expect(tableExists('audit_log')).toBe(false);
    expect(revertMigrations(db, WORKSPACE_MIGRATIONS).reverted).toBe(true); // 7
    expect(tableExists('pulse_metrics')).toBe(false);
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_pulse_metrics_metric_captured'"
        )
        .get()
    ).toBeUndefined();

    // Las 1..6 siguen intactas
    expect(tableExists('workspaces')).toBe(true);
    expect(tableExists('agent_commits')).toBe(true);

    // UP de nuevo: re-aplica 7 y 8 sin error ni duplicados
    runMigrations(db, WORKSPACE_MIGRATIONS);
    expect(tableExists('pulse_metrics')).toBe(true);
    expect(tableExists('audit_log')).toBe(true);
    const applied = db.prepare('SELECT id FROM __migrations ORDER BY id').all() as { id: number }[];
    expect(applied.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    db.close();
  });
});
