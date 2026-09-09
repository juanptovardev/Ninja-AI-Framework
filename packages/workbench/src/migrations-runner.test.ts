import { describe, it, expect } from 'vitest';
import { initDb, runMigrations, type Migration } from '@ninja/storage';
import { WORKSPACE_MIGRATIONS } from './migrations/workspace-migrations.js';

type WorkbenchDb = ReturnType<typeof initDb>;

const EXPECTED_TABLES = [
  'workspaces',
  'sessions',
  'runs',
  'artifacts',
  'event_log',
  'agent_commits',
  'pulse_metrics',
  'audit_log',
];

function tableExists(db: WorkbenchDb, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { name: string } | undefined;
  return row !== undefined;
}

function appliedIds(db: WorkbenchDb): number[] {
  const rows = db.prepare('SELECT id FROM __migrations ORDER BY id').all() as { id: number }[];
  return rows.map((r) => r.id);
}

function closeQuiet(db: WorkbenchDb): void {
  try {
    db.close();
  } catch {
    // ignore double-close in failure paths
  }
}

describe('WORKSPACE_MIGRATIONS runner', () => {
  it('applies all workspace tables in id order', () => {
    const db = initDb(':memory:');
    try {
      runMigrations(db, WORKSPACE_MIGRATIONS);
      for (const table of EXPECTED_TABLES) {
        expect(tableExists(db, table), `table ${table} should exist`).toBe(true);
      }
      expect(appliedIds(db)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    } finally {
      closeQuiet(db);
    }
  });

  it('is idempotent: re-running does not duplicate rows or fail', () => {
    const db = initDb(':memory:');
    try {
      runMigrations(db, WORKSPACE_MIGRATIONS);
      const before = appliedIds(db);
      runMigrations(db, WORKSPACE_MIGRATIONS);
      runMigrations(db, WORKSPACE_MIGRATIONS);
      expect(appliedIds(db)).toEqual(before);
      expect(appliedIds(db).length).toBe(WORKSPACE_MIGRATIONS.length);
      for (const table of EXPECTED_TABLES) {
        expect(tableExists(db, table)).toBe(true);
      }
    } finally {
      closeQuiet(db);
    }
  });

  it('creates the pulse_metrics index (migration 7 side effect)', () => {
    const db = initDb(':memory:');
    try {
      runMigrations(db, WORKSPACE_MIGRATIONS);
      const idx = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?")
        .get('idx_pulse_metrics_metric_captured') as { name: string } | undefined;
      expect(idx).toBeDefined();
    } finally {
      closeQuiet(db);
    }
  });

  it('applies migrations in ascending id order', () => {
    const order: number[] = [];
    const ordered: Migration[] = [1, 2, 3].map((id) => ({
      id,
      name: `step-${id}`,
      up: (db) => {
        order.push(id);
        db.exec(`CREATE TABLE order_step_${id} (id TEXT PRIMARY KEY)`);
      },
    }));
    const db = initDb(':memory:');
    try {
      runMigrations(db, ordered);
      expect(order).toEqual([1, 2, 3]);
      expect(appliedIds(db)).toEqual([1, 2, 3]);
    } finally {
      closeQuiet(db);
    }
  });

  it('fail-hard: a throwing migration propagates and later migrations are not applied', () => {
    const failing: Migration[] = [
      {
        id: 1,
        name: 'good-first',
        up: (db) => {
          db.exec('CREATE TABLE fh_first (id TEXT PRIMARY KEY)');
        },
      },
      {
        id: 2,
        name: 'boom',
        up: () => {
          throw new Error('boom-2');
        },
      },
      {
        id: 3,
        name: 'never-reached',
        up: (db) => {
          db.exec('CREATE TABLE fh_third (id TEXT PRIMARY KEY)');
        },
      },
    ];
    const db = initDb(':memory:');
    try {
      expect(() => runMigrations(db, failing)).toThrow(/boom-2/);
      expect(tableExists(db, 'fh_third')).toBe(false);
      expect(appliedIds(db).includes(3)).toBe(false);
      expect(appliedIds(db).includes(2)).toBe(false);
    } finally {
      closeQuiet(db);
    }
  });

  it('failed migration can succeed on retry after fix (no poisoned state)', () => {
    let shouldFail = true;
    const flaky: Migration[] = [
      {
        id: 1,
        name: 'flaky',
        up: (db) => {
          if (shouldFail) throw new Error('flaky-fail');
          db.exec('CREATE TABLE flaky_ok (id TEXT PRIMARY KEY)');
        },
      },
    ];
    const db = initDb(':memory:');
    try {
      expect(() => runMigrations(db, flaky)).toThrow(/flaky-fail/);
      shouldFail = false;
      runMigrations(db, flaky);
      expect(tableExists(db, 'flaky_ok')).toBe(true);
      expect(appliedIds(db)).toEqual([1]);
    } finally {
      closeQuiet(db);
    }
  });
});
