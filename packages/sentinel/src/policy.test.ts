import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PolicyEngine } from './policy.js';
import type { Logger } from '@ninja/logging';
import type { ID } from '@ninja/contracts';

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    name: 'test-logger',
  };
}

describe('PolicyEngine — default policies', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine(createMockLogger());
  });

  it('loads 5 default policies on construction', () => {
    expect(engine.listPolicies()).toHaveLength(5);
  });

  it('sorts policies by priority ascending', () => {
    const policies = engine.listPolicies();
    for (let i = 1; i < policies.length; i++) {
      expect(policies[i - 1].priority).toBeLessThanOrEqual(policies[i].priority);
    }
  });

  it('includes shell-execute-require-approval policy', () => {
    const policy = engine.getPolicy('shell-execute-require-approval' as ID);
    expect(policy).not.toBeNull();
    expect(policy!.action).toBe('require-approval');
    expect(policy!.actionType).toBe('shell.execute');
  });

  it('includes git-push-main-block policy', () => {
    const policy = engine.getPolicy('git-push-main-block' as ID);
    expect(policy).not.toBeNull();
    expect(policy!.action).toBe('block');
    expect(policy!.conditions).toEqual({ branch: 'main' });
  });

  it('includes agent-spawn-allow-log policy', () => {
    const policy = engine.getPolicy('agent-spawn-allow-log' as ID);
    expect(policy).not.toBeNull();
    expect(policy!.action).toBe('allow');
  });

  it('includes fs-write-outside-workspace-require-approval policy', () => {
    const policy = engine.getPolicy('fs-write-outside-workspace-require-approval' as ID);
    expect(policy).not.toBeNull();
    expect(policy!.action).toBe('require-approval');
    expect(policy!.conditions).toEqual({ requireApprovalOutsideWorkspace: true });
  });

  it('includes http-request-allow-audit policy', () => {
    const policy = engine.getPolicy('http-request-allow-audit' as ID);
    expect(policy).not.toBeNull();
    expect(policy!.action).toBe('allow');
  });
});

describe('PolicyEngine — evaluation: blocked actions', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine(createMockLogger());
  });

  it('blocks git.push with branch "main"', () => {
    const decision = engine.evaluate('git.push', {
      agentId: 'agent-1' as ID,
      actionDetails: { branch: 'main' },
    });
    expect(decision.action).toBe('block');
    expect(decision.policyId).toBe('git-push-main-block' as ID);
  });

  it('allows git.push with branch "feature"', () => {
    const decision = engine.evaluate('git.push', {
      agentId: 'agent-1' as ID,
      actionDetails: { branch: 'feature' },
    });
    expect(decision.action).toBe('allow');
  });

  it('allows git.push without branch in actionDetails', () => {
    const decision = engine.evaluate('git.push', {
      agentId: 'agent-1' as ID,
      actionDetails: {},
    });
    expect(decision.action).toBe('allow');
  });

  });

describe('PolicyEngine — evaluation: require-approval actions', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine(createMockLogger());
  });

  it('requires approval for shell.execute', () => {
    const decision = engine.evaluate('shell.execute', {
      agentId: 'agent-1' as ID,
      actionDetails: { cmd: 'rm -rf /' },
    });
    expect(decision.action).toBe('require-approval');
    expect(decision.policyId).toBe('shell-execute-require-approval' as ID);
  });

  it('requires approval for shell.execute even with empty actionDetails', () => {
    const decision = engine.evaluate('shell.execute', {
      agentId: 'agent-1' as ID,
      actionDetails: {},
    });
    expect(decision.action).toBe('require-approval');
  });

  it('requires approval for fs.write when condition matches', () => {
    const decision = engine.evaluate('fs.write', {
      agentId: 'agent-1' as ID,
      actionDetails: { requireApprovalOutsideWorkspace: true },
    });
    expect(decision.action).toBe('require-approval');
    expect(decision.policyId).toBe('fs-write-outside-workspace-require-approval' as ID);
  });

  it('allows fs.write when condition does not match', () => {
    const decision = engine.evaluate('fs.write', {
      agentId: 'agent-1' as ID,
      actionDetails: {},
    });
    expect(decision.action).toBe('allow');
  });
});

describe('PolicyEngine — evaluation: allowed actions', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine(createMockLogger());
  });

  it('allows agent.spawn with correct policyId', () => {
    const decision = engine.evaluate('agent.spawn', {
      agentId: 'agent-1' as ID,
      actionDetails: {},
    });
    expect(decision.action).toBe('allow');
    expect(decision.policyId).toBe('agent-spawn-allow-log' as ID);
  });

  it('allows http.request with correct policyId', () => {
    const decision = engine.evaluate('http.request', {
      agentId: 'agent-1' as ID,
      actionDetails: {},
    });
    expect(decision.action).toBe('allow');
    expect(decision.policyId).toBe('http-request-allow-audit' as ID);
  });

  it('defaults to allow for unknown action types', () => {
    const decision = engine.evaluate('unknown.action', {
      agentId: 'agent-1' as ID,
      actionDetails: {},
    });
    expect(decision.action).toBe('allow');
    expect(decision.policyId).toBeUndefined();
    expect(decision.reason).toContain('defaulting to allow');
  });
});

describe('PolicyEngine — wildcard matching', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine(createMockLogger());
  });

  it('matches wildcard policy with exact subtype', () => {
    engine.registerPolicy({
      id: 'test-wildcard' as ID,
      name: 'Test Wildcard',
      description: 'Wildcard test',
      actionType: 'test.*',
      action: 'block',
      priority: 1,
    });
    const decision = engine.evaluate('test.subtype', {
      agentId: 'agent-1' as ID,
      actionDetails: {},
    });
    expect(decision.action).toBe('block');
    expect(decision.policyId).toBe('test-wildcard' as ID);
  });

  it('does not match wildcard for unrelated action types', () => {
    engine.registerPolicy({
      id: 'test-wildcard' as ID,
      name: 'Test Wildcard',
      description: 'Wildcard test',
      actionType: 'test.*',
      action: 'block',
      priority: 1,
    });
    const decision = engine.evaluate('other.action', {
      agentId: 'agent-1' as ID,
      actionDetails: {},
    });
    expect(decision.action).toBe('allow');
  });

  it('matches exact action type without wildcard', () => {
    engine.registerPolicy({
      id: 'exact-match' as ID,
      name: 'Exact Match',
      description: 'Exact match test',
      actionType: 'exact.match',
      action: 'block',
      priority: 1,
    });
    const decision = engine.evaluate('exact.match', {
      agentId: 'agent-1' as ID,
      actionDetails: {},
    });
    expect(decision.action).toBe('block');
    expect(decision.policyId).toBe('exact-match' as ID);
  });
});

describe('PolicyEngine — custom policy registration and removal', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine(createMockLogger());
  });

  it('increments policy count on register', () => {
    const initial = engine.listPolicies().length;
    engine.registerPolicy({
      id: 'custom-1' as ID,
      name: 'Custom Policy',
      description: 'A custom policy',
      actionType: 'custom.action',
      action: 'block',
      priority: 50,
    });
    expect(engine.listPolicies()).toHaveLength(initial + 1);
  });

  it('inserts custom policy respecting priority order', () => {
    engine.registerPolicy({
      id: 'high-priority-custom' as ID,
      name: 'High Priority Custom',
      description: 'Overrides default policies',
      actionType: 'shell.execute',
      action: 'allow',
      priority: 1,
    });
    const decision = engine.evaluate('shell.execute', {
      agentId: 'agent-1' as ID,
      actionDetails: {},
    });
    expect(decision.action).toBe('allow');
    expect(decision.policyId).toBe('high-priority-custom' as ID);
  });

  it('removes an existing policy and returns true', () => {
    const result = engine.removePolicy('shell-execute-require-approval' as ID);
    expect(result).toBe(true);
    expect(engine.getPolicy('shell-execute-require-approval' as ID)).toBeNull();
  });

  it('returns false when removing non-existent policy', () => {
    const result = engine.removePolicy('non-existent-policy' as ID);
    expect(result).toBe(false);
  });

  it('does not change policy count when removing non-existent policy', () => {
    const before = engine.listPolicies().length;
    engine.removePolicy('non-existent-policy' as ID);
    expect(engine.listPolicies()).toHaveLength(before);
  });

  it('requiresApproval helper returns correct result', () => {
    const needsApproval = engine.requiresApproval('shell.execute', {
      agentId: 'agent-1' as ID,
      actionDetails: {},
    });
    expect(needsApproval).toBe(true);

    const notNeeded = engine.requiresApproval('agent.spawn', {
      agentId: 'agent-1' as ID,
      actionDetails: {},
    });
    expect(notNeeded).toBe(false);
  });
});

describe('PolicyEngine — getFriendlyDecisionSummary', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine(createMockLogger());
  });

  it('returns blocked message for block action', () => {
    const summary = engine.getFriendlyDecisionSummary({
      action: 'block',
      reason: 'Blocked by policy',
      metadata: { actionType: 'git.push' },
    });
    expect(summary).toContain('bloqueada');
    expect(summary).toContain('Blocked by policy');
  });

  it('returns require-approval message for require-approval action', () => {
    const summary = engine.getFriendlyDecisionSummary({
      action: 'require-approval',
      reason: 'Needs approval',
      metadata: { actionType: 'shell.execute' },
    });
    expect(summary).toContain('Aprobación requerida');
    expect(summary).toContain('Needs approval');
  });

  it('returns allowed message for allow action', () => {
    const summary = engine.getFriendlyDecisionSummary({
      action: 'allow',
      reason: 'Action permitted',
      metadata: { actionType: 'agent.spawn' },
    });
    expect(summary).toContain('permitida');
    expect(summary).toContain('Action permitted');
  });

  it('handles unknown action gracefully', () => {
    const summary = engine.getFriendlyDecisionSummary({
      action: 'unknown' as never,
      reason: 'Unknown action',
    });
    expect(summary).toContain('unknown');
  });
});

describe('PolicyEngine — conditions edge cases', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine(createMockLogger());
  });

  it('matches policy with empty conditions object', () => {
    engine.registerPolicy({
      id: 'empty-conditions' as ID,
      name: 'Empty Conditions',
      description: 'Conditions is empty object',
      actionType: 'test.empty',
      action: 'block',
      priority: 1,
      conditions: {},
    });
    const decision = engine.evaluate('test.empty', {
      agentId: 'agent-1' as ID,
      actionDetails: {},
    });
    expect(decision.action).toBe('block');
  });

  it('allows registering policies with duplicate IDs (no uniqueness check)', () => {
    engine.registerPolicy({
      id: 'duplicate-id' as ID,
      name: 'First',
      description: 'First policy with this ID',
      actionType: 'first.action',
      action: 'block',
      priority: 5,
    });
    engine.registerPolicy({
      id: 'duplicate-id' as ID,
      name: 'Second',
      description: 'Second policy with same ID',
      actionType: 'second.action',
      action: 'allow',
      priority: 10,
    });
    const policies = engine.listPolicies().filter((p) => p.id === ('duplicate-id' as ID));
    expect(policies).toHaveLength(2);
  });
});