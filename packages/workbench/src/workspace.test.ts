import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb, runMigrations } from '@ninja/storage';
import type { NinjaEvent, Result } from '@ninja/contracts';
import type { WorkspaceContext } from './schema.js';
import { createWorkspace, openWorkspace, listWorkspaces } from './workspace.js';
import { setActiveContext, getActiveContext, clearActiveContext } from './context.js';
import { WORKSPACE_MIGRATIONS } from './migrations/workspace-migrations.js';
import { MockEventBus } from '../../../tests/helpers/mock-event-bus.js';

let tmpRoot: string;
let bus: MockEventBus;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'wb-ws-'));
  bus = new MockEventBus();
  clearActiveContext();
  vi.useRealTimers();
});

afterEach(() => {
  bus.clear();
  clearActiveContext();
  vi.useRealTimers();
  vi.restoreAllMocks();
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // best-effort cleanup: workbench leaks sqlite handles (no close),
    // on Windows an open handle can block deletion until process exit.
  }
});

function unwrapOk(result: Result<WorkspaceContext, Error>, label: string): WorkspaceContext {
  expect(result.success, label).toBe(true);
  if (!result.success) throw new Error(`expected ok (${label}): ${result.error.message}`);
  return result.data;
}

describe('createWorkspace', () => {
  it('creates directory, .ninja dir and sqlite db with workspace record', () => {
    const wsPath = join(tmpRoot, 'my-ws');
    const result = createWorkspace({ name: 'my-ws', path: wsPath });
    const ctx = unwrapOk(result, 'create should succeed');

    expect(ctx.workspace.name).toBe('my-ws');
    expect(ctx.workspace.path).toBe(wsPath);
    expect(ctx.workspace.status).toBe('active');
    expect(ctx.workspace.id.length).toBeGreaterThan(0);
    expect(existsSync(wsPath)).toBe(true);
    expect(existsSync(ctx.ninjaDir)).toBe(true);
    expect(existsSync(ctx.dbPath)).toBe(true);

    // Record actually persisted: reopening the db directly finds the row.
    const db = initDb(ctx.dbPath);
    try {
      const row = db.prepare('SELECT id, name, path FROM workspaces WHERE path = ?').get(wsPath) as
        | { id: string; name: string; path: string }
        | undefined;
      expect(row).toBeDefined();
      expect(row?.id).toBe(ctx.workspace.id);
      expect(row?.name).toBe('my-ws');
    } finally {
      db.close();
    }
  });

  it('reuses an existing empty directory instead of failing', () => {
    const wsPath = join(tmpRoot, 'preexisting');
    mkdirSync(wsPath, { recursive: true });
    const result = createWorkspace({ name: 'pre', path: wsPath });
    const ctx = unwrapOk(result, 'create in existing dir should succeed');
    expect(existsSync(ctx.dbPath)).toBe(true);
    expect(ctx.workspace.name).toBe('pre');
  });

  it('sets ISO timestamps on creation', () => {
    const wsPath = join(tmpRoot, 'ts-ws');
    const ctx = unwrapOk(createWorkspace({ name: 'ts', path: wsPath }), 'create');
    expect(typeof ctx.workspace.createdAt).toBe('string');
    expect(Number.isNaN(Date.parse(ctx.workspace.createdAt))).toBe(false);
    expect(Number.isNaN(Date.parse(ctx.workspace.updatedAt))).toBe(false);
  });

  it('honours fake timers for timestamps', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
    const wsPath = join(tmpRoot, 'fake-time-ws');
    const ctx = unwrapOk(createWorkspace({ name: 'ft', path: wsPath }), 'create');
    expect(ctx.workspace.createdAt.startsWith('2026-01-15')).toBe(true);
  });

  it('second create on the same path fails (UNIQUE path constraint)', () => {
    const wsPath = join(tmpRoot, 'dup');
    const first = createWorkspace({ name: 'dup', path: wsPath });
    expect(first.success).toBe(true);
    const second = createWorkspace({ name: 'dup', path: wsPath });
    expect(second.success).toBe(false);
  });

  it('notifies observers through the event bus with the created workspace id', () => {
    const wsPath = join(tmpRoot, 'observed');
    const ctx = unwrapOk(createWorkspace({ name: 'observed', path: wsPath }), 'create');

    const seen: string[] = [];
    bus.on('workspace.created', (event) => {
      const payload = (event as unknown as { workspaceId?: string }).workspaceId;
      if (payload !== undefined) seen.push(payload);
    });
    bus.emit({
      type: 'workspace.created',
      workspaceId: ctx.workspace.id,
    } as unknown as NinjaEvent);
    bus.emit({ type: 'workspace.created', workspaceId: 'other' } as unknown as NinjaEvent);

    const events = bus.getEvents('workspace.created');
    expect(events.length).toBe(2);
    expect(seen).toEqual([ctx.workspace.id, 'other']);
  });
});

describe('openWorkspace', () => {
  it('reopens a created workspace with the same id', () => {
    const wsPath = join(tmpRoot, 'reopen');
    const created = unwrapOk(createWorkspace({ name: 'reopen', path: wsPath }), 'create');
    const opened = unwrapOk(openWorkspace({ path: wsPath }), 'open');
    expect(opened.workspace.id).toBe(created.workspace.id);
    expect(opened.workspace.name).toBe('reopen');
    expect(opened.dbPath).toBe(created.dbPath);
    expect(opened.ninjaDir).toBe(created.ninjaDir);
  });

  it('returns err when the path does not exist', () => {
    const result = openWorkspace({ path: join(tmpRoot, 'missing') });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toMatch(/does not exist/);
    }
  });

  it('returns err when the workspace db file is missing', () => {
    const emptyDir = join(tmpRoot, 'empty');
    mkdirSync(emptyDir, { recursive: true });
    const result = openWorkspace({ path: emptyDir });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toMatch(/database not found/);
    }
  });

  it('returns err when the db exists but holds no record for the path', () => {
    const wsPath = join(tmpRoot, 'orphan');
    mkdirSync(join(wsPath, '.ninja'), { recursive: true });
    const dbPath = join(wsPath, '.ninja', 'workspace.db');
    const db = initDb(dbPath);
    try {
      runMigrations(db, WORKSPACE_MIGRATIONS);
    } finally {
      db.close();
    }
    const result = openWorkspace({ path: wsPath });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toMatch(/not found in database/);
    }
  });

  it('returns err when the database file cannot be opened (db path is a directory)', () => {
    const wsPath = join(tmpRoot, 'corrupt');
    mkdirSync(join(wsPath, '.ninja', 'workspace.db'), { recursive: true });
    const result = openWorkspace({ path: wsPath });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error instanceof Error).toBe(true);
    }
  });
});

describe('close/list semantics (adapted to exposed API)', () => {
  it('close = setActiveContext + clearActiveContext round-trip', () => {
    const wsPath = join(tmpRoot, 'active');
    const ctx = unwrapOk(createWorkspace({ name: 'active', path: wsPath }), 'create');
    setActiveContext(ctx);
    expect(getActiveContext()?.workspace.id).toBe(ctx.workspace.id);
    clearActiveContext();
    expect(getActiveContext()).toBeNull();
  });

  it('listWorkspaces returns an array (currently a stub returning [])', () => {
    const result = listWorkspaces(tmpRoot);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });

  it('listWorkspaces does not throw for a non-existent base dir', () => {
    expect(() => listWorkspaces(join(tmpRoot, 'nope'))).not.toThrow();
    expect(listWorkspaces(join(tmpRoot, 'nope'))).toEqual([]);
  });
});
