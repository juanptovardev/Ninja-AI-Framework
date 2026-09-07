/**
 * Test integración Auditor → audit_log (WP-C4b / F2.5).
 *
 * Auditor con hook de persistencia real (AuditLogRepository), como lo cablea
 * server.ts. Verifica: evento → fila, log() inmediato, stop()/flush() idempotente
 * (sin duplicados) y modo sin hook (logger-only).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '@ninja/events';
import type { Logger } from '@ninja/logging';
import { initDb } from '@ninja/storage';
import type { Database } from '@ninja/storage';
import { AuditLogRepository } from '@ninja/trace-ledger';
import { Auditor } from './auditor.js';

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

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  name: 'test-logger',
};

describe('Auditor → audit_log (WP-C4b)', () => {
  let db: Database.Database;

  afterEach(() => {
    if (db && db.open) db.close();
  });

  it('sentinel.action.blocked → fila en audit_log vía persistencia', () => {
    db = initDb(':memory:');
    db.exec(AUDIT_LOG_DDL);
    const repo = new AuditLogRepository(db);
    const bus = new EventBus();

    const auditor = new Auditor(bus, noopLogger, (entry) => repo.insert(entry));
    auditor.start();

    bus.emit({
      id: 'evt-3',
      type: 'sentinel.action.blocked',
      source: 'sentinel',
      timestamp: new Date().toISOString(),
      payload: {
        agentId: 'agent-architect',
        runId: 'run-42',
        actionType: 'shell.execute',
        reason: 'policy: block external execution',
        policyId: 'policy-1',
      },
    });

    const rows = repo.findByActor('agent-architect');
    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe('shell.execute');
    expect(rows[0].result).toBe('blocked');
    expect(rows[0].target).toBe('run-42');
    expect(rows[0].detail).toContain('block external execution');
  });

  it('log() persiste de inmediato · stop()/flush() es idempotente (sin duplicados)', () => {
    db = initDb(':memory:');
    db.exec(AUDIT_LOG_DDL);
    const repo = new AuditLogRepository(db);
    const bus = new EventBus();

    const auditor = new Auditor(bus, noopLogger, (entry) => repo.insert(entry));

    auditor.log({
      id: 'audit-1',
      timestamp: new Date().toISOString(),
      agentId: 'agent-x',
      actionType: 'git.commit',
      action: 'require-approval',
      result: 'approved',
      reason: 'operator approved',
      approvalId: 'appr-9',
    });
    expect(repo.findByActor('agent-x').length).toBe(1);

    // stop() ejecuta flush — la entrada ya está persistida (persistedIds) → sin duplicados
    auditor.stop();
    const total = repo.findByRange('2000-01-01T00:00:00.000Z', '2999-01-01T00:00:00.000Z');
    expect(total.length).toBe(1);
    expect(total[0].actor).toBe('agent-x');
    expect(total[0].target).toBe('appr-9');
  });

  it('Auditor sin persistencia → flush logger-only, sin filas nuevas', () => {
    db = initDb(':memory:');
    db.exec(AUDIT_LOG_DDL);
    const repo = new AuditLogRepository(db);
    const bus = new EventBus();

    const auditor = new Auditor(bus, noopLogger); // sin hook
    auditor.log({
      id: 'audit-2',
      timestamp: new Date().toISOString(),
      agentId: 'agent-y',
      actionType: 'git.commit',
      action: 'block',
      result: 'blocked',
      reason: 'no approval',
    });
    auditor.stop();

    expect(repo.findByActor('agent-y').length).toBe(0);
  });

  it('persistencia con hook que lanza → no rompe al auditor (best-effort logueado)', () => {
    db = initDb(':memory:');
    db.exec(AUDIT_LOG_DDL);
    const repo = new AuditLogRepository(db);
    const bus = new EventBus();

    const failingLogger: Logger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      name: 'failing-logger',
    };

    const auditor = new Auditor(bus, failingLogger, () => {
      throw new Error('db gone');
    });

    expect(() =>
      auditor.log({
        id: 'audit-3',
        timestamp: new Date().toISOString(),
        agentId: 'agent-z',
        actionType: 'shell.execute',
        action: 'allow',
        result: 'allowed',
        reason: 'ok',
      })
    ).not.toThrow();

    // La entrada sigue en memoria (fuente de verdad del runtime)
    expect(auditor.getAuditLog().length).toBe(1);
    // Y no hay fila en DB (el hook falló)
    expect(repo.findByActor('agent-z').length).toBe(0);
  });
});
