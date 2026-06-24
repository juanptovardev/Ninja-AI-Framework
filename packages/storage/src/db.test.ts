import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { initDb, closeDb } from './db.js';
import { runMigrations, type Migration } from './migrations.js';
import { WorkspaceRepository } from './repositories/workspace.repository.js';

function createWorkspaceTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
}

describe('initDb', () => {
  it('opens an in-memory database', () => {
    const db = initDb(':memory:');
    expect(db).toBeDefined();
    expect(db.open).toBe(true);
    closeDb(db);
  });

  it('sets journal mode without error', () => {
    const db = initDb(':memory:');
    const mode = db.pragma('journal_mode', { simple: true }) as string;
    expect(['wal', 'memory']).toContain(mode.toLowerCase());
    closeDb(db);
  });

  it('enables foreign keys', () => {
    const db = initDb(':memory:');
    const result = db.pragma('foreign_keys', { simple: true }) as string;
    expect(Number(result)).toBe(1);
    closeDb(db);
  });

  it('returns a Database instance with open connection', () => {
    const db = initDb(':memory:');
    expect(typeof db.prepare).toBe('function');
    expect(typeof db.exec).toBe('function');
    expect(db.open).toBe(true);
    closeDb(db);
  });
});

describe('closeDb', () => {
  it('closes the database connection', () => {
    const db = initDb(':memory:');
    expect(db.open).toBe(true);
    closeDb(db);
    expect(db.open).toBe(false);
  });

  it('is safe to close an already closed database', () => {
    const db = initDb(':memory:');
    closeDb(db);
    expect(() => closeDb(db)).not.toThrow();
  });
});

describe('runMigrations', () => {
  let db: Database.Database;
  const migration1: Migration = {
    id: 1,
    name: 'create_test_table',
    up: (d) => {
      d.exec('CREATE TABLE test_1 (id INTEGER PRIMARY KEY, value TEXT)');
    },
  };
  const migration2: Migration = {
    id: 2,
    name: 'create_another_table',
    up: (d) => {
      d.exec('CREATE TABLE test_2 (id INTEGER PRIMARY KEY, name TEXT)');
    },
  };

  beforeEach(() => {
    db = initDb(':memory:');
  });

  afterEach(() => {
    closeDb(db);
  });

  it('creates the __migrations tracking table', () => {
    runMigrations(db, [migration1]);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__migrations'").get();
    expect(tables).toBeTruthy();
  });

  it('applies pending migrations in order', () => {
    runMigrations(db, [migration1, migration2]);
    const test1Exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='test_1'").get();
    const test2Exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='test_2'").get();
    expect(test1Exists).toBeTruthy();
    expect(test2Exists).toBeTruthy();
  });

  it('records applied migrations in __migrations table', () => {
    runMigrations(db, [migration1]);

    const records = db.prepare('SELECT id, name FROM __migrations ORDER BY id').all() as { id: number; name: string }[];
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe(1);
    expect(records[0].name).toBe('create_test_table');
  });

  it('skips already executed migrations', () => {
    runMigrations(db, [migration1, migration2]);

    const appliedBefore = (db.prepare('SELECT COUNT(*) as count FROM __migrations').get() as { count: number }).count;

    runMigrations(db, [migration1, migration2]);

    const appliedAfter = (db.prepare('SELECT COUNT(*) as count FROM __migrations').get() as { count: number }).count;
    expect(appliedAfter).toBe(appliedBefore);
  });

  it('throws on failed migration and does not register it', () => {
    const badMigration: Migration = {
      id: 99,
      name: 'bad_migration',
      up: (d) => { d.exec('INVALID SQL STATEMENT'); },
    };

    expect(() => runMigrations(db, [badMigration])).toThrow();

    const count = (db.prepare("SELECT COUNT(*) as count FROM __migrations WHERE id = 99").get() as { count: number }).count;
    expect(count).toBe(0);
  });

  it('handles empty migrations array without error', () => {
    expect(() => runMigrations(db, [])).not.toThrow();
  });
});

describe('WorkspaceRepository', () => {
  let db: Database.Database;
  let repo: WorkspaceRepository;

  beforeEach(() => {
    db = initDb(':memory:');
    createWorkspaceTable(db);
    repo = new WorkspaceRepository(db);
  });

  afterEach(() => {
    closeDb(db);
  });

  it('create inserts a workspace and returns the record', () => {
    const record = repo.create({ name: 'test-ws', path: '/tmp/ws' });

    expect(record).toHaveProperty('id');
    expect(record.name).toBe('test-ws');
    expect(record.path).toBe('/tmp/ws');
    expect(record).toHaveProperty('createdAt');
    expect(record).toHaveProperty('updatedAt');
    expect(record.createdAt).toBe(record.updatedAt);
  });

  it('findById returns a workspace by id', () => {
    const created = repo.create({ name: 'ws1', path: '/path/ws1' });

    const found = repo.findById(created.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('ws1');
    expect(found!.path).toBe('/path/ws1');
  });

  it('findById returns null for non-existent id', () => {
    const result = repo.findById('non-existent-id');
    expect(result).toBeNull();
  });

  it('findAll returns all workspaces', () => {
    repo.create({ name: 'a', path: '/a' });
    repo.create({ name: 'b', path: '/b' });
    repo.create({ name: 'c', path: '/c' });

    const all = repo.findAll();
    expect(all).toHaveLength(3);
  });

  it('findAll returns empty array when no workspaces', () => {
    const all = repo.findAll();
    expect(all).toEqual([]);
  });

  it('findByPath returns workspace by path', () => {
    repo.create({ name: 'ws1', path: '/unique/path' });

    const found = repo.findByPath('/unique/path');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('ws1');
  });

  it('findByPath returns null for non-existent path', () => {
    const result = repo.findByPath('/nonexistent');
    expect(result).toBeNull();
  });

  it('update modifies name and bumps updatedAt', () => {
    const created = repo.create({ name: 'original', path: '/path' });

    const updated = repo.update(created.id, { name: 'modified' });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('modified');
    expect(updated!.path).toBe('/path');
    expect(updated!.updatedAt >= created.updatedAt).toBe(true);
    expect(updated!.id).toBe(created.id);
  });

  it('update returns null for non-existent id', () => {
    const result = repo.update('bad-id', { name: 'x' });
    expect(result).toBeNull();
  });

  it('deleteById removes a workspace and returns true', () => {
    const created = repo.create({ name: 'to-delete', path: '/delete' });

    const deleted = repo.deleteById(created.id);
    expect(deleted).toBe(true);

    const found = repo.findById(created.id);
    expect(found).toBeNull();
  });

  it('deleteById returns false for non-existent id', () => {
    const result = repo.deleteById('non-existent');
    expect(result).toBe(false);
  });

  it('update preserves createdAt and id fields', () => {
    const created = repo.create({ name: 'preserve-test', path: '/preserve' });
    const createdAt = created.createdAt;
    const id = created.id;

    const updated = repo.update(id, { name: 'preserved', path: '/new-path' });
    expect(updated!.id).toBe(id);
    expect(updated!.createdAt).toBe(createdAt);
    expect(updated!.name).toBe('preserved');
    expect(updated!.path).toBe('/new-path');
  });
});

describe('BaseRepository inherited behavior', () => {
  let db: Database.Database;
  let repo: WorkspaceRepository;

  beforeEach(() => {
    db = initDb(':memory:');
    createWorkspaceTable(db);
    repo = new WorkspaceRepository(db);
  });

  afterEach(() => {
    closeDb(db);
  });

  it('findById works on empty table', () => {
    const result = repo.findById('anything');
    expect(result).toBeNull();
  });

  it('findAll returns empty for new database', () => {
    const all = repo.findAll();
    expect(all).toHaveLength(0);
  });

  it('deleteById on non-existent returns false', () => {
    const result = repo.deleteById('ghost-id');
    expect(result).toBe(false);
  });

  it('multiple create and findById round-trips', () => {
    const w1 = repo.create({ name: 'alpha', path: '/alpha' });
    const w2 = repo.create({ name: 'beta', path: '/beta' });
    const w3 = repo.create({ name: 'gamma', path: '/gamma' });

    expect(repo.findById(w1.id)!.name).toBe('alpha');
    expect(repo.findById(w2.id)!.name).toBe('beta');
    expect(repo.findById(w3.id)!.name).toBe('gamma');
  });

  it('can delete and recreate a workspace with the same data', () => {
    const w1 = repo.create({ name: 'temp', path: '/temp' });
    repo.deleteById(w1.id);

    const w2 = repo.create({ name: 'temp', path: '/temp' });
    expect(w2.id).not.toBe(w1.id);
    expect(repo.findAll()).toHaveLength(1);
  });
});