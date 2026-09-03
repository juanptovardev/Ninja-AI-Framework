import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Guardian } from './guardian.js';
import { PolicyEngine } from './policy.js';
import { ApprovalManager } from './approval.js';
import type { ApproverIdentity } from './approval.js';
import { EventBus, createEvent } from '@ninja/events';
import type { Logger } from '@ninja/logging';
import type { ID } from '@ninja/contracts';
import type { NinjaEvent } from '@ninja/contracts';
import type { SentinelBlockedPayload } from './schema.js';

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    name: 'test-logger',
  };
}

const AGENT_ID = 'agent-1' as ID;
const RUN_ID = 'run-1' as ID;
const APPROVER: ApproverIdentity = { id: 'user-admin', role: 'admin' };

function collectEvents(bus: EventBus): NinjaEvent[] {
  const events: NinjaEvent[] = [];
  bus.onAny((event) => {
    events.push(event);
  });
  return events;
}

describe('Guardian — blocking actions with PolicyEngine', () => {
  let bus: EventBus;
  let policyEngine: PolicyEngine;
  let approvalManager: ApprovalManager;
  let guardian: Guardian;

  beforeEach(() => {
    bus = new EventBus();
    policyEngine = new PolicyEngine(createMockLogger());
    approvalManager = new ApprovalManager(bus, createMockLogger(), 300000);
    guardian = new Guardian(bus, createMockLogger(), approvalManager, policyEngine);
  });

  it('evaluateAction returns false for blocked action', async () => {
    const result = await guardian.evaluateAction('git.push', AGENT_ID, RUN_ID, { branch: 'main' });
    expect(result).toBe(false);
  });

  it('emits sentinel.action.blocked event when action is blocked', async () => {
    const events = collectEvents(bus);

    await guardian.evaluateAction('git.push', AGENT_ID, RUN_ID, { branch: 'main' });

    const blockedEvents = events.filter((e) => e.type === 'sentinel.action.blocked');
    expect(blockedEvents).toHaveLength(1);

    const payload = blockedEvents[0].payload as SentinelBlockedPayload;
    expect(payload.agentId).toBe(AGENT_ID);
    expect(payload.runId).toBe(RUN_ID);
    expect(payload.actionType).toBe('git.push');
    expect(payload.policyId).toBe('git-push-main-block' as ID);
    expect(payload.reason).toContain('Policy matched');
  });

  it('blocked event payload has all SentinelBlockedPayload fields', async () => {
    const events = collectEvents(bus);

    await guardian.evaluateAction('git.push', AGENT_ID, RUN_ID, { branch: 'main' });

    const blockedEvents = events.filter((e) => e.type === 'sentinel.action.blocked');
    const payload = blockedEvents[0].payload as SentinelBlockedPayload;
    expect(payload).toHaveProperty('agentId');
    expect(payload).toHaveProperty('runId');
    expect(payload).toHaveProperty('actionType');
    expect(payload).toHaveProperty('reason');
    expect(payload).toHaveProperty('policyId');
  });
});

describe('Guardian — require-approval actions', () => {
  let bus: EventBus;
  let policyEngine: PolicyEngine;
  let approvalManager: ApprovalManager;
  let guardian: Guardian;

  beforeEach(() => {
    bus = new EventBus();
    policyEngine = new PolicyEngine(createMockLogger());
    approvalManager = new ApprovalManager(bus, createMockLogger(), 300000);
    guardian = new Guardian(bus, createMockLogger(), approvalManager, policyEngine);
  });

  it('evaluateAction returns false when approval is rejected', async () => {
    const promise = guardian.evaluateAction('shell.execute', AGENT_ID, RUN_ID, { cmd: 'ls' });

    const pending = approvalManager.listPendingApprovals();
    if (pending.length > 0) {
      await approvalManager.rejectRequest(pending[0].id, APPROVER, 'Not authorized');
    }

    const result = await promise;
    expect(result).toBe(false);
  });

  it('evaluateAction returns true when approval is granted', async () => {
    const promise = guardian.evaluateAction('shell.execute', AGENT_ID, RUN_ID, { cmd: 'ls' });

    const pending = approvalManager.listPendingApprovals();
    if (pending.length > 0) {
      await approvalManager.approveRequest(pending[0].id, APPROVER, 'Looks good');
    }

    const result = await promise;
    expect(result).toBe(true);
  });

  it('does NOT emit sentinel.action.blocked for require-approval', async () => {
    const events = collectEvents(bus);

    const promise = guardian.evaluateAction('shell.execute', AGENT_ID, RUN_ID, { cmd: 'ls' });

    const pending = approvalManager.listPendingApprovals();
    if (pending.length > 0) {
      await approvalManager.rejectRequest(pending[0].id, APPROVER, 'Not authorized');
    }
    await promise;

    const blockedEvents = events.filter((e) => e.type === 'sentinel.action.blocked');
    expect(blockedEvents).toHaveLength(0);
  });
});

describe('Guardian — allowed actions', () => {
  let bus: EventBus;
  let policyEngine: PolicyEngine;
  let approvalManager: ApprovalManager;
  let guardian: Guardian;

  beforeEach(() => {
    bus = new EventBus();
    policyEngine = new PolicyEngine(createMockLogger());
    approvalManager = new ApprovalManager(bus, createMockLogger(), 300000);
    guardian = new Guardian(bus, createMockLogger(), approvalManager, policyEngine);
  });

  it('evaluateAction returns true for allowed action', async () => {
    const result = await guardian.evaluateAction('agent.spawn', AGENT_ID, RUN_ID);
    expect(result).toBe(true);
  });

  it('evaluateAction returns true for default allow (unknown action)', async () => {
    const result = await guardian.evaluateAction('unknown.action', AGENT_ID, RUN_ID);
    expect(result).toBe(true);
  });

  it('does not emit any sentinel events for allowed actions', async () => {
    const events = collectEvents(bus);

    await guardian.evaluateAction('agent.spawn', AGENT_ID, RUN_ID);

    const sentinelEvents = events.filter((e) => e.type.startsWith('sentinel.'));
    expect(sentinelEvents).toHaveLength(0);
  });
});

// F1.6: el describe legacy vacío "without PolicyEngine" fue eliminado — sus casos
// están superseded por los tests deny-by-default de WP-B5 (Manual §5.4: 0 suites vacías).

describe('Guardian deny-by-default (WP-B5)', () => {
  let bus: EventBus;
  let approvalManager: ApprovalManager;

  beforeEach(() => {
    bus = new EventBus();
    approvalManager = new ApprovalManager(bus, createMockLogger(), 300000);
  });

  it('without PolicyEngine → denies action (deny-by-default)', async () => {
    const mockLogger = createMockLogger();
    const guardian = new Guardian(bus, mockLogger, approvalManager);
    const result = await guardian.evaluateAction('shell.execute', AGENT_ID, RUN_ID);
    expect(result).toBe(false);
  });

  it('with PolicyEngine + allow policy → permits', async () => {
    const policyEngine = new PolicyEngine(createMockLogger());
    policyEngine.registerPolicy({
      id: 'allow-agent-spawn' as ID,
      name: 'Allow agent spawn',
      description: 'Allow',
      actionType: 'agent.spawn',
      action: 'allow',
      priority: 1,
    });
    const guardian = new Guardian(bus, createMockLogger(), approvalManager, policyEngine);
    const result = await guardian.evaluateAction('agent.spawn', AGENT_ID, RUN_ID);
    expect(result).toBe(true);
  });

  it('with PolicyEngine + deny policy → blocks', async () => {
    const policyEngine = new PolicyEngine(createMockLogger());
    // git.push to main is blocked by default policy in PolicyEngine
    const guardian = new Guardian(bus, createMockLogger(), approvalManager, policyEngine);
    const result = await guardian.evaluateAction('git.push', AGENT_ID, RUN_ID, { branch: 'main' });
    expect(result).toBe(false);
  });

  it('with PolicyEngine + require-approval policy → delegates to ApprovalManager', async () => {
    const policyEngine = new PolicyEngine(createMockLogger());
    // shell.execute requires approval by default policy in PolicyEngine
    const guardian = new Guardian(bus, createMockLogger(), approvalManager, policyEngine);

    const promise = guardian.evaluateAction('shell.execute', AGENT_ID, RUN_ID, { cmd: 'ls' });

    const pending = approvalManager.listPendingApprovals();
    if (pending.length > 0) {
      await approvalManager.approveRequest(pending[0].id, APPROVER, 'ok');
    }

    const result = await promise;
    expect(result).toBe(true);
  });
});

describe('Guardian — health degradation reaction', () => {
  let bus: EventBus;
  let policyEngine: PolicyEngine;
  let approvalManager: ApprovalManager;
  let guardian: Guardian;
  const mockLogger = createMockLogger();

  beforeEach(() => {
    bus = new EventBus();
    policyEngine = new PolicyEngine(createMockLogger());
    approvalManager = new ApprovalManager(bus, createMockLogger(), 300000);
    guardian = new Guardian(bus, mockLogger, approvalManager, policyEngine);
    guardian.start();
  });

  it('emits sentinel.intervention on health.degradation.detected', () => {
    const events = collectEvents(bus);

    bus.emit(
      createEvent('health.degradation.detected', 'pulse-center', {
        providerId: 'provider-openai',
        severity: 'critical',
        message: 'API latency exceeded threshold',
      })
    );

    const interventionEvents = events.filter((e) => e.type === 'sentinel.intervention');
    expect(interventionEvents).toHaveLength(1);
  });

  it('intervention payload contains action pause_affected_agents and reason', () => {
    const events = collectEvents(bus);

    bus.emit(
      createEvent('health.degradation.detected', 'pulse-center', {
        providerId: 'provider-openai',
        severity: 'critical',
      })
    );

    const interventionEvents = events.filter((e) => e.type === 'sentinel.intervention');
    const payload = interventionEvents[0].payload as Record<string, unknown>;
    expect(payload.action).toBe('pause_affected_agents');
    expect(payload.reason).toContain('provider-openai');
  });

  it('health.context.inefficient logs warning but does not emit sentinel intervention', () => {
    const events = collectEvents(bus);

    bus.emit(
      createEvent('health.context.inefficient', 'pulse-center', {
        agentId: AGENT_ID,
        contextUtilization: 0.95,
      })
    );

    const interventionEvents = events.filter((e) => e.type === 'sentinel.intervention');
    expect(interventionEvents).toHaveLength(0);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Guardian detected context inefficiency',
      expect.anything()
    );
  });
});

describe('Guardian — agent failure + controlled degradation', () => {
  let bus: EventBus;
  let policyEngine: PolicyEngine;
  let approvalManager: ApprovalManager;
  let guardian: Guardian;

  beforeEach(() => {
    bus = new EventBus();
    policyEngine = new PolicyEngine(createMockLogger());
    approvalManager = new ApprovalManager(bus, createMockLogger(), 300000);
    guardian = new Guardian(bus, createMockLogger(), approvalManager, policyEngine);
    guardian.start();
  });

  it('health degradation + agent action evaluation both work independently', async () => {
    const events = collectEvents(bus);

    bus.emit(
      createEvent('health.degradation.detected', 'pulse-center', {
        providerId: 'provider-openai',
        severity: 'critical',
      })
    );

    // Bloquear la acción para que no quede pending
    const evaluationResult = await guardian.evaluateAction('git.push', AGENT_ID, RUN_ID, {
      branch: 'main',
    });

    const interventionEvents = events.filter((e) => e.type === 'sentinel.intervention');
    expect(interventionEvents).toHaveLength(1);

    expect(evaluationResult).toBe(false);
  });

  it('degradation does not affect allow decisions for safe actions', async () => {
    const events = collectEvents(bus);

    bus.emit(
      createEvent('health.degradation.detected', 'pulse-center', {
        providerId: 'provider-openai',
        severity: 'degraded',
      })
    );

    const allowResult = await guardian.evaluateAction('agent.spawn', AGENT_ID, RUN_ID);
    expect(allowResult).toBe(true);

    const interventionEvents = events.filter((e) => e.type === 'sentinel.intervention');
    expect(interventionEvents).toHaveLength(1);
  });
});
