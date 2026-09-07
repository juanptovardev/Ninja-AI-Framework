import type { Migration } from '@ninja/storage';

/**
 * Workspace migrations for initializing the database schema.
 */
export const WORKSPACE_MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: 'Create workspaces table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          path TEXT NOT NULL UNIQUE,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        )
      `);
    },
  },
  {
    id: 2,
    name: 'Create sessions table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          workspaceId TEXT NOT NULL,
          startedAt TEXT NOT NULL,
          endedAt TEXT,
          FOREIGN KEY (workspaceId) REFERENCES workspaces(id)
        )
      `);
    },
  },
  {
    id: 3,
    name: 'Create runs table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS runs (
          id TEXT PRIMARY KEY,
          sessionId TEXT NOT NULL,
          mode TEXT NOT NULL,
          status TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          FOREIGN KEY (sessionId) REFERENCES sessions(id)
        )
      `);
    },
  },
  {
    id: 4,
    name: 'Create artifacts table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS artifacts (
          id TEXT PRIMARY KEY,
          runId TEXT NOT NULL,
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          content TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          FOREIGN KEY (runId) REFERENCES runs(id)
        )
      `);
    },
  },
  {
    id: 5,
    name: 'Create event_log table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS event_log (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          source TEXT NOT NULL,
          payload TEXT NOT NULL,
          createdAt TEXT NOT NULL
        )
      `);
    },
  },
  {
    id: 6,
    name: 'Create agent_commits table (RF-16)',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_commits (
          id TEXT PRIMARY KEY,
          runId TEXT NOT NULL,
          agentRole TEXT NOT NULL,
          summary TEXT NOT NULL,
          filesChanged TEXT NOT NULL DEFAULT '[]',
          timestampMs INTEGER NOT NULL
        )
      `);
    },
  },
  {
    id: 7,
    name: 'Create pulse_metrics table (WP-C4b / F2.5)',
    up: (db) => {
      db.exec(`
        CREATE TABLE pulse_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          captured_at TEXT NOT NULL,
          metric TEXT NOT NULL,
          value REAL NOT NULL,
          context TEXT
        )
      `);
      db.exec(`
        CREATE INDEX idx_pulse_metrics_metric_captured
        ON pulse_metrics (metric, captured_at)
      `);
    },
    down: (db) => {
      db.exec('DROP INDEX IF EXISTS idx_pulse_metrics_metric_captured');
      db.exec('DROP TABLE IF EXISTS pulse_metrics');
    },
  },
  {
    id: 8,
    name: 'Create audit_log table (WP-C4b / F2.5)',
    up: (db) => {
      db.exec(`
        CREATE TABLE audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT NOT NULL,
          actor TEXT NOT NULL,
          action TEXT NOT NULL,
          target TEXT,
          result TEXT NOT NULL,
          detail TEXT
        )
      `);
    },
    down: (db) => {
      db.exec('DROP TABLE IF EXISTS audit_log');
    },
  },
];
