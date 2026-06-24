import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DelegationRouter } from '../router.js';
import { RosterManager } from '@ninja/roster';

// Mock logger
vi.mock('@ninja/logging', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock client-adapters getClientAdapter and getAgentAdapter
vi.mock('@ninja/client-adapters', () => {
  const mockAdapter = {
    execute: vi.fn().mockResolvedValue({
      status: 'success',
      output: 'Mock execution result',
      durationMs: 150,
    }),
  };
  return {
    getClientAdapter: vi.fn(() => mockAdapter),
    getAgentAdapter: vi.fn(() => mockAdapter),
  };
});

describe('DelegationRouter', () => {
  let rosterManagerMock: RosterManager;
  let eventBusMock: any;
  let vaultMock: any;

  beforeEach(() => {
    // Mock RosterManager
    rosterManagerMock = {
      getRoster: vi.fn().mockReturnValue({
        version: '1.0.0',
        roles: {
          orchestrator: 'codex',
          sentinel: 'claude-code',
          workers: ['opencode'],
        },
        clients: {
          opencode: {
            id: 'opencode',
            name: 'OPENCODE',
            executablePath: '/usr/bin/opencode',
            connectionMethod: { type: 'headless-cli', command: 'opencode', flags: [] },
            status: 'connected',
            capabilities: [],
            assignedRole: 'worker',
          },
        },
      }),
    } as unknown as RosterManager;

    // Mock EventBus
    eventBusMock = {
      emit: vi.fn(),
    };

    // Mock Vault
    vaultMock = {
      query: vi.fn().mockResolvedValue([
        {
          layer: 'HOT',
          entries: [{ content: 'This is hot key context' }],
        },
      ]),
    };
  });

  it('should delegate tasks and trigger correct adapter', async () => {
    const router = new DelegationRouter({
      rosterManager: rosterManagerMock,
      eventBus: eventBusMock,
    });

    const result = await router.delegate({
      taskId: 'test-task-123',
      fromClient: 'codex',
      toClient: 'opencode',
      prompt: 'Refactor login controller',
    });

    expect(result.status).toBe('success');
    expect(result.output).toBe('Mock execution result');
    expect(result.clientUsed).toBe('opencode');
    expect(eventBusMock.emit).toHaveBeenCalledWith('delegation.started', expect.any(Object));
    expect(eventBusMock.emit).toHaveBeenCalledWith('delegation.completed', expect.any(Object));
  });

  it('should enrich prompt from vault when vaultCoordinator is present', async () => {
    const router = new DelegationRouter({
      rosterManager: rosterManagerMock,
      vaultCoordinator: vaultMock,
      eventBus: eventBusMock,
    });

    const result = await router.delegate({
      taskId: 'test-task-456',
      fromClient: 'codex',
      toClient: 'opencode',
      prompt: 'Refactor database models',
      sessionId: 'session-789',
    });

    expect(vaultMock.query).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'codex',
        sessionId: 'session-789',
        query: 'Refactor database models',
      })
    );
    expect(result.status).toBe('success');
  });

  it('should handle errors gracefully during delegation', async () => {
    // Force rosterManager to throw an error
    rosterManagerMock.getRoster = vi.fn(() => {
      throw new Error('Roster corrupted');
    });

    const router = new DelegationRouter({
      rosterManager: rosterManagerMock,
      eventBus: eventBusMock,
    });

    const result = await router.delegate({
      taskId: 'test-task-failed',
      fromClient: 'codex',
      toClient: 'opencode',
      prompt: 'Some work',
    });

    expect(result.status).toBe('error');
    expect(result.output).toContain('Roster corrupted');
    expect(eventBusMock.emit).toHaveBeenCalledWith('delegation.failed', expect.any(Object));
  });
});
