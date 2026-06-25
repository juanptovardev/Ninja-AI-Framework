import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb } from '@ninja/storage';
import type { Database } from '@ninja/storage';
import { AgentCommitRepository } from './repositories/agent-commit.repository.js';

function makeDb(): Database.Database {
  const db = initDb(':memory:');
  db.exec(`
    CREATE TABLE agent_commits (
      id TEXT PRIMARY KEY,
      runId TEXT NOT NULL,
      agentRole TEXT NOT NULL,
      summary TEXT NOT NULL,
      filesChanged TEXT NOT NULL DEFAULT '[]',
      timestampMs INTEGER NOT NULL
    )
  `);
  return db;
}

describe('AgentCommitRepository', () => {
  let db: Database.Database;
  let repo: AgentCommitRepository;

  beforeEach(() => {
    db = makeDb();
    repo = new AgentCommitRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates and returns a commit record', () => {
    const record = {
      id: 'c1',
      runId: 'r1',
      agentRole: 'Backend',
      summary: 'implemented feature X',
      filesChanged: JSON.stringify(['src/a.ts']),
      timestampMs: 1000,
    };
    const result = repo.create(record);
    expect(result).toEqual(record);
  });

  it('findByRunId returns commits for that run in ASC order', () => {
    repo.create({ id: 'c1', runId: 'r1', agentRole: 'Backend', summary: 'first', filesChanged: '[]', timestampMs: 1000 });
    repo.create({ id: 'c2', runId: 'r1', agentRole: 'Tester', summary: 'second', filesChanged: '[]', timestampMs: 2000 });
    repo.create({ id: 'c3', runId: 'r2', agentRole: 'Planner', summary: 'other', filesChanged: '[]', timestampMs: 500 });

    const result = repo.findByRunId('r1');
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('c1');
    expect(result[1]!.id).toBe('c2');
  });

  it('findAll returns all commits DESC by timestampMs with limit', () => {
    repo.create({ id: 'c1', runId: 'r1', agentRole: 'Backend', summary: 'a', filesChanged: '[]', timestampMs: 1000 });
    repo.create({ id: 'c2', runId: 'r1', agentRole: 'Tester', summary: 'b', filesChanged: '[]', timestampMs: 3000 });
    repo.create({ id: 'c3', runId: 'r2', agentRole: 'Planner', summary: 'c', filesChanged: '[]', timestampMs: 2000 });

    const all = repo.findAll();
    expect(all).toHaveLength(3);
    expect(all[0]!.timestampMs).toBe(3000);

    const limited = repo.findAll(2);
    expect(limited).toHaveLength(2);
  });

  it('findById returns the record or null', () => {
    repo.create({ id: 'c1', runId: 'r1', agentRole: 'Backend', summary: 'x', filesChanged: '[]', timestampMs: 1 });
    expect(repo.findById('c1')?.id).toBe('c1');
    expect(repo.findById('missing')).toBeNull();
  });
});
