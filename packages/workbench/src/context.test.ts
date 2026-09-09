import { describe, it, expect, beforeEach } from 'vitest';
import {
  setActiveContext,
  getActiveContext,
  clearActiveContext,
  requireActiveContext,
} from './context.js';
import type { WorkspaceContext } from './schema.js';

function makeContext(id: string): WorkspaceContext {
  return {
    workspace: {
      id,
      name: `ws-${id}`,
      path: `/tmp/ws-${id}`,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    dbPath: `/tmp/ws-${id}/.ninja/workspace.db`,
    ninjaDir: `/tmp/ws-${id}/.ninja`,
  };
}

beforeEach(() => {
  clearActiveContext();
});

describe('active context lifecycle', () => {
  it('returns null when no context has been set', () => {
    expect(getActiveContext()).toBeNull();
  });

  it('returns the context that was set', () => {
    const ctx = makeContext('ctx-1');
    setActiveContext(ctx);
    const got = getActiveContext();
    expect(got).toBe(ctx);
    expect(got?.workspace.id).toBe('ctx-1');
    expect(got?.dbPath).toBe(ctx.dbPath);
  });

  it('last set wins when set twice', () => {
    setActiveContext(makeContext('first'));
    const second = makeContext('second');
    setActiveContext(second);
    expect(getActiveContext()?.workspace.id).toBe('second');
  });

  it('clear removes a previously set context', () => {
    setActiveContext(makeContext('to-clear'));
    clearActiveContext();
    expect(getActiveContext()).toBeNull();
  });

  it('requireActiveContext throws when none is set', () => {
    expect(() => requireActiveContext()).toThrow(/No active workspace context/);
  });

  it('requireActiveContext returns the active context without cloning', () => {
    const ctx = makeContext('required');
    setActiveContext(ctx);
    expect(requireActiveContext()).toBe(ctx);
  });

  it('set → clear → require throws (close semantic)', () => {
    setActiveContext(makeContext('ephemeral'));
    clearActiveContext();
    expect(getActiveContext()).toBeNull();
    expect(() => requireActiveContext()).toThrow();
  });
});
