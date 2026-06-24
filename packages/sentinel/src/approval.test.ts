import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApprovalManager } from './approval.js';
import type { ApproverIdentity } from './approval.js';
import { EventBus } from '@ninja/events';
import type { Logger } from '@ninja/logging';
import type { ID } from '@ninja/contracts';
import type { NinjaEvent } from '@ninja/contracts';

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    name: 'test-logger',
  };
}

function createApprovalOptions(overrides: Partial<{
  runId: ID;
  agentId: ID;
  actionType: string;
  actionSummary: string;
  technicalDetails: string;
  policyId: ID;
  timeoutMs: number;
}> = {}) {
  return {
    runId: 'run-1' as ID,
    agentId: 'agent-1' as ID,
    actionType: 'shell.execute',
    actionSummary: 'Execute shell command: ls -la',
    technicalDetails: 'Command: ls -la\nCWD: /home\nUser: agent-1',
    policyId: 'shell-execute-require-approval' as ID,
    ...overrides,
  };
}

const APPROVAL_REQUESTED = 'sentinel.approval.requested';
const APPROVAL_RECEIVED = 'sentinel.approval.received';
const APPROVAL_CANCELLED = 'sentinel.approval.cancelled';

const ADMIN_APPROVER: ApproverIdentity = { id: 'user-admin', role: 'admin' };
const OPERATOR_APPROVER: ApproverIdentity = { id: 'user-operator', role: 'operator' };

function collectEvents(bus: EventBus): NinjaEvent[] {
  const events: NinjaEvent[] = [];
  bus.onAny((event) => { events.push(event); });
  return events;
}

function createAndCapture(manager: ApprovalManager, overrides: Partial<ReturnType<typeof createApprovalOptions>> = {}) {
  const promise = manager.createApprovalRequest(createApprovalOptions(overrides));
  const pending = manager.listPendingApprovals();
  const approvalId = pending[pending.length - 1].id;
  return { promise, approvalId };
}

describe('ApprovalManager — approval lifecycle', () => {
  let bus: EventBus;
  let manager: ApprovalManager;

  beforeEach(() => {
    bus = new EventBus();
    manager = new ApprovalManager(bus, createMockLogger(), 300000);
  });

  it('createApprovalRequest emits sentinel.approval.requested event', async () => {
    const events = collectEvents(bus);

    const { promise, approvalId } = createAndCapture(manager, { timeoutMs: 5000 });

    const requestedEvents = events.filter((e) => e.type === APPROVAL_REQUESTED);
    expect(requestedEvents).toHaveLength(1);

    const payload = requestedEvents[0].payload as Record<string, unknown>;
    expect(payload.actionType).toBe('shell.execute');
    expect(payload.agentId).toBe('agent-1');
    expect(payload.runId).toBe('run-1');
    expect(payload.actionSummary).toBe('Execute shell command: ls -la');
    expect(payload.technicalDetails).toBe('Command: ls -la\nCWD: /home\nUser: agent-1');

    await manager.cancelRequest(approvalId);
    await expect(promise).rejects.toThrow();
  });

  it('approveRequest resolves promise with approved: true', async () => {
    const { promise, approvalId } = createAndCapture(manager, { timeoutMs: 5000 });

    await manager.approveRequest(approvalId, ADMIN_APPROVER, 'Looks good');

    const result = await promise;
    expect(result.approved).toBe(true);
    expect(result.notes).toBe('Looks good');
    expect(result.respondedAt).toBeDefined();
    expect(result.approvedBy).toBe('user-admin::admin');
  });

  it('approveRequest emits sentinel.approval.received with approved: true', async () => {
    const events = collectEvents(bus);

    const { promise, approvalId } = createAndCapture(manager, { timeoutMs: 5000 });
    await manager.approveRequest(approvalId, ADMIN_APPROVER);
    await promise;

    const receivedEvents = events.filter((e) => e.type === APPROVAL_RECEIVED);
    expect(receivedEvents).toHaveLength(1);
    const payload = receivedEvents[0].payload as Record<string, unknown>;
    expect(payload.approved).toBe(true);
    expect(payload.approvalId).toBe(approvalId);
    expect(payload.approvedBy).toBe('user-admin::admin');
  });

  it('approveRequest removes approval from pending list', async () => {
    const { promise, approvalId } = createAndCapture(manager, { timeoutMs: 5000 });

    expect(manager.getPendingApproval(approvalId)).not.toBeNull();
    await manager.approveRequest(approvalId, ADMIN_APPROVER);
    await promise;

    expect(manager.getPendingApproval(approvalId)).toBeNull();
  });

  it('rejectRequest resolves promise with approved: false', async () => {
    const { promise, approvalId } = createAndCapture(manager, { timeoutMs: 5000 });

    await manager.rejectRequest(approvalId, ADMIN_APPROVER, 'Not authorized');

    const result = await promise;
    expect(result.approved).toBe(false);
    expect(result.notes).toBe('Not authorized');
    expect(result.approvedBy).toBe('user-admin::admin');
  });

  it('rejectRequest emits sentinel.approval.received with approved: false', async () => {
    const events = collectEvents(bus);

    const { promise, approvalId } = createAndCapture(manager, { timeoutMs: 5000 });
    await manager.rejectRequest(approvalId, ADMIN_APPROVER, 'Denied');
    await promise;

    const receivedEvents = events.filter((e) => e.type === APPROVAL_RECEIVED);
    expect(receivedEvents).toHaveLength(1);
    const payload = receivedEvents[0].payload as Record<string, unknown>;
    expect(payload.approved).toBe(false);
    expect(payload.notes).toBe('Denied');
    expect(payload.approvedBy).toBe('user-admin::admin');
  });

  it('rejectRequest removes approval from pending list', async () => {
    const { promise, approvalId } = createAndCapture(manager, { timeoutMs: 5000 });

    expect(manager.getPendingApproval(approvalId)).not.toBeNull();
    await manager.rejectRequest(approvalId, ADMIN_APPROVER, 'No');
    await promise;

    expect(manager.getPendingApproval(approvalId)).toBeNull();
  });

  it('approveRequest on already-approved request throws "not pending"', async () => {
    const { promise, approvalId } = createAndCapture(manager, { timeoutMs: 5000 });

    await manager.approveRequest(approvalId, ADMIN_APPROVER);
    await promise;

    await expect(manager.approveRequest(approvalId, ADMIN_APPROVER)).rejects.toThrow(/not pending/i);
  });

  it('approveRequest on non-existent request throws "not found"', async () => {
    await expect(manager.approveRequest('non-existent-id' as ID, ADMIN_APPROVER)).rejects.toThrow(/not found/i);
  });

  it('rejectRequest on already-rejected request throws "not pending"', async () => {
    const { promise, approvalId } = createAndCapture(manager, { timeoutMs: 5000 });

    await manager.rejectRequest(approvalId, ADMIN_APPROVER, 'No');
    await promise;

    await expect(manager.rejectRequest(approvalId, ADMIN_APPROVER, 'Again')).rejects.toThrow(/not pending/i);
  });

  it('rejectRequest on non-existent request throws "not found"', async () => {
    await expect(manager.rejectRequest('non-existent-id' as ID, ADMIN_APPROVER, 'No')).rejects.toThrow(/not found/i);
  });
});

describe('ApprovalManager — approver identity verification', () => {
  let bus: EventBus;
  let manager: ApprovalManager;

  beforeEach(() => {
    bus = new EventBus();
    manager = new ApprovalManager(bus, createMockLogger(), 300000);
  });

  it('approveRequest stores approvedBy in the approval record', async () => {
    const { promise, approvalId } = createAndCapture(manager, { timeoutMs: 5000 });
    await manager.approveRequest(approvalId, ADMIN_APPROVER, 'Approved');
    await promise;

    const approval = manager.getPendingApproval(approvalId);
    expect(approval).toBeNull();
  });

  it('approveRequest result includes approvedBy string', async () => {
    const { promise, approvalId } = createAndCapture(manager, { timeoutMs: 5000 });
    await manager.approveRequest(approvalId, OPERATOR_APPROVER, 'OK');
    const result = await promise;
    expect(result.approvedBy).toBe('user-operator::operator');
  });

  it('rejectRequest result includes approvedBy string', async () => {
    const { promise, approvalId } = createAndCapture(manager, { timeoutMs: 5000 });
    await manager.rejectRequest(approvalId, ADMIN_APPROVER, 'Nope');
    const result = await promise;
    expect(result.approvedBy).toBe('user-admin::admin');
  });

  it('event payload includes approvedBy field', async () => {
    const events = collectEvents(bus);
    const { promise, approvalId } = createAndCapture(manager, { timeoutMs: 5000 });
    await manager.approveRequest(approvalId, ADMIN_APPROVER, 'OK');
    await promise;

    const receivedEvents = events.filter((e) => e.type === APPROVAL_RECEIVED);
    const payload = receivedEvents[0].payload as Record<string, unknown>;
    expect(payload.approvedBy).toBe('user-admin::admin');
  });

  it('throws when approver id is empty', async () => {
    const { approvalId } = createAndCapture(manager, { timeoutMs: 5000 });
    const emptyIdApprover: ApproverIdentity = { id: '', role: 'admin' };

    await expect(
      manager.approveRequest(approvalId, emptyIdApprover, 'Nope')
    ).rejects.toThrow(/identity id is required/i);
  });

  it('throws when approver id is whitespace-only', async () => {
    const { approvalId } = createAndCapture(manager, { timeoutMs: 5000 });
    const whitespaceApprover: ApproverIdentity = { id: '   ', role: 'admin' };

    await expect(
      manager.approveRequest(approvalId, whitespaceApprover, 'Nope')
    ).rejects.toThrow(/identity id is required/i);
  });

  it('throws when approver role is empty', async () => {
    const { approvalId } = createAndCapture(manager, { timeoutMs: 5000 });
    const emptyRoleApprover: ApproverIdentity = { id: 'user-1', role: '' };

    await expect(
      manager.approveRequest(approvalId, emptyRoleApprover, 'Nope')
    ).rejects.toThrow(/identity role is required/i);
  });

  it('throws when approver role is unauthorized', async () => {
    const { approvalId } = createAndCapture(manager, { timeoutMs: 5000 });
    const unauthorizedApprover: ApproverIdentity = { id: 'hacker', role: 'agent' };

    await expect(
      manager.approveRequest(approvalId, unauthorizedApprover, 'Trying')
    ).rejects.toThrow(/not authorized/i);
  });

  it('rejectRequest throws when approver role is unauthorized', async () => {
    const { approvalId } = createAndCapture(manager, { timeoutMs: 5000 });
    const unauthorizedApprover: ApproverIdentity = { id: 'hacker', role: 'agent' };

    await expect(
      manager.rejectRequest(approvalId, unauthorizedApprover, 'No')
    ).rejects.toThrow(/not authorized/i);
  });

  it('throws when approver is the same agent that created the request (self-approval)', async () => {
    const { approvalId } = createAndCapture(manager, { timeoutMs: 5000 });
    const selfApprover: ApproverIdentity = { id: 'agent-1', role: 'admin' };

    await expect(
      manager.approveRequest(approvalId, selfApprover, 'I approve myself')
    ).rejects.toThrow(/cannot approve their own request/i);
  });

  it('rejectRequest throws on self-approval attempt', async () => {
    const { approvalId } = createAndCapture(manager, { timeoutMs: 5000 });
    const selfApprover: ApproverIdentity = { id: 'agent-1', role: 'admin' };

    await expect(
      manager.rejectRequest(approvalId, selfApprover, 'I reject myself')
    ).rejects.toThrow(/cannot approve their own request/i);
  });

  it('allows a different agent with authorized role to approve', async () => {
    const { promise, approvalId } = createAndCapture(manager, { timeoutMs: 5000 });
    const differentAgentApprover: ApproverIdentity = { id: 'agent-2', role: 'senior-agent' };

    await manager.approveRequest(approvalId, differentAgentApprover, 'OK');
    const result = await promise;
    expect(result.approved).toBe(true);
    expect(result.approvedBy).toBe('agent-2::senior-agent');
  });

  it('custom authorized roles are respected', async () => {
    const customManager = new ApprovalManager(bus, createMockLogger(), 300000, ['custom-role']);
    const { promise, approvalId } = createAndCapture(customManager, { timeoutMs: 5000 });
    const customApprover: ApproverIdentity = { id: 'user-x', role: 'custom-role' };

    await customManager.approveRequest(approvalId, customApprover, 'OK');
    const result = await promise;
    expect(result.approved).toBe(true);

    await manager.cancelRequest(approvalId).catch(() => {});
  });

  it('default admin role is authorized', async () => {
    const { promise, approvalId } = createAndCapture(manager, { timeoutMs: 5000 });

    await manager.approveRequest(approvalId, ADMIN_APPROVER, 'OK');
    const result = await promise;
    expect(result.approved).toBe(true);
  });

  it('approval stays pending after unauthorized approval attempt', async () => {
    const { approvalId } = createAndCapture(manager, { timeoutMs: 5000 });
    const unauthorizedApprover: ApproverIdentity = { id: 'hacker', role: 'agent' };

    await expect(
      manager.approveRequest(approvalId, unauthorizedApprover, 'Nope')
    ).rejects.toThrow();

    expect(manager.getPendingApproval(approvalId)).not.toBeNull();

    await manager.approveRequest(approvalId, ADMIN_APPROVER, 'Real approval');
  });
});

describe('ApprovalManager — timeout handling', () => {
  let bus: EventBus;
  let manager: ApprovalManager;

  beforeEach(() => {
    vi.useFakeTimers();
    bus = new EventBus();
    manager = new ApprovalManager(bus, createMockLogger(), 300000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects promise when timeout expires', async () => {
    const { promise } = createAndCapture(manager, { timeoutMs: 100 });

    vi.advanceTimersByTime(150);

    await expect(promise).rejects.toThrow(/timed out/i);
    expect(manager.getPendingCount()).toBe(0);
  });

  it('emits sentinel.approval.cancelled on timeout', async () => {
    const events: NinjaEvent[] = [];
    bus.onAny((event) => { events.push(event); });

    const { promise } = createAndCapture(manager, { timeoutMs: 100 });

    vi.advanceTimersByTime(150);
    await expect(promise).rejects.toThrow();

    const cancelledEvents = events.filter((e) => e.type === APPROVAL_CANCELLED);
    expect(cancelledEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('clears pendingResponses after timeout', async () => {
    const { promise } = createAndCapture(manager, { timeoutMs: 100 });

    expect(manager.getPendingCount()).toBe(1);

    vi.advanceTimersByTime(150);

    expect(manager.getPendingCount()).toBe(0);
    await expect(promise).rejects.toThrow();
  });

  it('approveRequest before timeout clears the timer', async () => {
    const { promise, approvalId } = createAndCapture(manager, { timeoutMs: 50000 });

    await manager.approveRequest(approvalId, ADMIN_APPROVER, 'Approved quickly');

    vi.advanceTimersByTime(100000);

    const result = await promise;
    expect(result.approved).toBe(true);
  });
});

describe('ApprovalManager — cancellation', () => {
  let bus: EventBus;
  let manager: ApprovalManager;

  beforeEach(() => {
    bus = new EventBus();
    manager = new ApprovalManager(bus, createMockLogger(), 300000);
  });

  it('cancelRequest rejects the pending promise', async () => {
    const { promise, approvalId } = createAndCapture(manager, { timeoutMs: 5000 });

    await manager.cancelRequest(approvalId, 'User cancelled');

    await expect(promise).rejects.toThrow(/was cancelled/i);
  });

  it('cancelRequest emits sentinel.approval.cancelled event', async () => {
    const events = collectEvents(bus);

    const { promise, approvalId } = createAndCapture(manager, { timeoutMs: 5000 });
    await manager.cancelRequest(approvalId, 'Admin override');
    await expect(promise).rejects.toThrow();

    const cancelledEvents = events.filter((e) => e.type === APPROVAL_CANCELLED);
    expect(cancelledEvents).toHaveLength(1);
    const payload = cancelledEvents[0].payload as Record<string, unknown>;
    expect(payload.reason).toBe('Admin override');
  });

  it('cancelRequest on non-existent request does not throw', async () => {
    await expect(
      manager.cancelRequest('non-existent' as ID, 'No matter')
    ).resolves.not.toThrow();
  });

  it('cancelRequest removes the approval from tracking', async () => {
    const { promise, approvalId } = createAndCapture(manager, { timeoutMs: 5000 });

    await manager.cancelRequest(approvalId);
    await expect(promise).rejects.toThrow();

    expect(manager.getPendingApproval(approvalId)).toBeNull();
  });
});

describe('ApprovalManager — queries and filtering', () => {
  let bus: EventBus;
  let manager: ApprovalManager;

  beforeEach(() => {
    bus = new EventBus();
    manager = new ApprovalManager(bus, createMockLogger(), 300000);
  });

  it('listPendingApprovals returns only pending requests', async () => {
    const { promise: p1, approvalId: id1 } = createAndCapture(manager, { timeoutMs: 5000 });
    const { promise: p2, approvalId: id2 } = createAndCapture(manager, {
      runId: 'run-2' as ID,
      agentId: 'agent-2' as ID,
      timeoutMs: 5000,
    });

    expect(manager.listPendingApprovals()).toHaveLength(2);

    await manager.approveRequest(id1, ADMIN_APPROVER);
    await p1;

    expect(manager.listPendingApprovals()).toHaveLength(1);

    await manager.cancelRequest(id2);
    await expect(p2).rejects.toThrow();

    expect(manager.listPendingApprovals()).toHaveLength(0);
  });

  it('listPendingApprovalsByAgent filters by agent', async () => {
    const { promise: p1, approvalId: id1 } = createAndCapture(manager, { timeoutMs: 5000 });
    p1.catch(() => {});
    const { promise: p2, approvalId: id2 } = createAndCapture(manager, {
      agentId: 'agent-2' as ID,
      timeoutMs: 5000,
    });
    p2.catch(() => {});

    const agent1Pending = manager.listPendingApprovalsByAgent('agent-1' as ID);
    expect(agent1Pending).toHaveLength(1);
    expect(agent1Pending[0].agentId).toBe('agent-1');

    const agent2Pending = manager.listPendingApprovalsByAgent('agent-2' as ID);
    expect(agent2Pending).toHaveLength(1);

    await manager.cancelRequest(id1).catch(() => {});
    await manager.cancelRequest(id2).catch(() => {});
  });

  it('listPendingApprovalsByRun filters by run', async () => {
    const { promise: p1, approvalId: id1 } = createAndCapture(manager, { timeoutMs: 5000 });
    p1.catch(() => {});
    const { promise: p2, approvalId: id2 } = createAndCapture(manager, {
      runId: 'run-2' as ID,
      timeoutMs: 5000,
    });
    p2.catch(() => {});

    const run1Pending = manager.listPendingApprovalsByRun('run-1' as ID);
    expect(run1Pending).toHaveLength(1);

    const run2Pending = manager.listPendingApprovalsByRun('run-2' as ID);
    expect(run2Pending).toHaveLength(1);

    await manager.cancelRequest(id1).catch(() => {});
    await manager.cancelRequest(id2).catch(() => {});
  });

  it('getApprovalCount includes all approvals (pending and completed)', async () => {
    const { promise: p1, approvalId: id1 } = createAndCapture(manager, { timeoutMs: 5000 });

    expect(manager.getApprovalCount()).toBe(1);

    const { promise: p2, approvalId: id2 } = createAndCapture(manager, {
      agentId: 'agent-2' as ID,
      actionType: 'http.request',
      timeoutMs: 5000,
    });

    expect(manager.getApprovalCount()).toBe(2);

    await manager.approveRequest(id1, ADMIN_APPROVER);
    await p1;

    expect(manager.getApprovalCount()).toBe(2);
    expect(manager.getPendingCount()).toBe(1);

    await manager.cancelRequest(id2).catch(() => {});
    await expect(p2).rejects.toThrow();

    expect(manager.getApprovalCount()).toBe(1);
  });
});

describe('ApprovalManager — cleanup expired approvals', () => {
  let bus: EventBus;
  let manager: ApprovalManager;

  beforeEach(() => {
    vi.useFakeTimers();
    bus = new EventBus();
    manager = new ApprovalManager(bus, createMockLogger(), 300000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cleanupExpiredApprovals cleans approvals expired beyond default timeout', async () => {
    const { promise, approvalId } = createAndCapture(manager, { timeoutMs: 600000 });

    vi.advanceTimersByTime(310000);
    expect(manager.listPendingApprovals()).toHaveLength(1);

    const cleaned = await manager.cleanupExpiredApprovals();
    expect(cleaned).toBe(1);

    await expect(promise).rejects.toThrow(/cancelled/);
  });

  it('cleanupExpiredApprovals returns 0 when no expired approvals exist', async () => {
    const { promise } = createAndCapture(manager, { timeoutMs: 600000 });
    promise.catch(() => {});

    const cleaned = await manager.cleanupExpiredApprovals();
    expect(cleaned).toBe(0);
  });
});

describe('ApprovalManager — doble confirmación structure', () => {
  let bus: EventBus;
  let manager: ApprovalManager;

  beforeEach(() => {
    bus = new EventBus();
    manager = new ApprovalManager(bus, createMockLogger(), 300000);
  });

  it('both actionSummary and technicalDetails are present in the event payload', async () => {
    const events = collectEvents(bus);
    const { promise, approvalId } = createAndCapture(manager, { timeoutMs: 5000 });

    const requestedEvents = events.filter((e) => e.type === APPROVAL_REQUESTED);
    const payload = requestedEvents[0].payload as Record<string, unknown>;
    expect(payload.actionSummary).toBeDefined();
    expect(payload.technicalDetails).toBeDefined();
    expect(typeof payload.actionSummary).toBe('string');
    expect(typeof payload.technicalDetails).toBe('string');
    expect(payload.actionSummary).not.toBe('');

    await manager.cancelRequest(approvalId);
    await expect(promise).rejects.toThrow();
  });

  it('actionSummary and technicalDetails contain different content', async () => {
    const events = collectEvents(bus);
    const { promise, approvalId } = createAndCapture(manager, { timeoutMs: 5000 });

    const requestedEvents = events.filter((e) => e.type === APPROVAL_REQUESTED);
    const payload = requestedEvents[0].payload as Record<string, unknown>;
    expect(payload.actionSummary).not.toBe(payload.technicalDetails);

    await manager.cancelRequest(approvalId);
    await expect(promise).rejects.toThrow();
  });
});
