import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';

vi.stubEnv('LLM_BASE_URL', 'http://localhost:11434/v1');
vi.stubEnv('LLM_API_KEY', 'test-key');
vi.stubEnv('LLM_DEFAULT_MODEL', 'gpt-4o-mini');
vi.stubEnv('NINJA_AUTH_DISABLED', 'true');

const sentinelMocks = vi.hoisted(() => ({
  approveRequest: vi.fn(),
  rejectRequest: vi.fn(),
}));

vi.mock('@ninja/sentinel', () => {
  class MockApprovalManager {
    approveRequest = sentinelMocks.approveRequest;
    rejectRequest = sentinelMocks.rejectRequest;
    listPendingApprovals = vi.fn().mockReturnValue([]);
    createApprovalRequest = vi.fn();
    getAuditLog = vi.fn().mockReturnValue([]);
  }
  class MockPolicyEngine {
    registerPolicy = vi.fn();
  }
  class MockAuditor {
    start = vi.fn();
    getAuditLog = vi.fn().mockReturnValue([]);
  }
  class MockGuardian {
    start = vi.fn();
    stop = vi.fn();
  }
  return {
    ApprovalManager: MockApprovalManager,
    PolicyEngine: MockPolicyEngine,
    Auditor: MockAuditor,
    Guardian: MockGuardian,
  };
});

vi.mock('@ninja/kage-engine', () => {
  const mockEngine = {
    submit: vi.fn(),
    getStatus: vi.fn(),
    approve: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    startInterview: vi.fn().mockResolvedValue(undefined),
    submitAnswers: vi.fn().mockResolvedValue(undefined),
  };
  return {
    KageEngine: class { constructor() { return mockEngine; } },
    HttpController: class {
      constructor() {
        return {
          handleSubmit: vi.fn().mockResolvedValue({ status: 200, body: {} }),
          handleGetRunStatus: vi.fn().mockResolvedValue({ status: 200, body: {} }),
          handleApprove: vi.fn().mockResolvedValue({ status: 200, body: {} }),
          handlePause: vi.fn().mockResolvedValue({ status: 200, body: {} }),
          handleResume: vi.fn().mockResolvedValue({ status: 200, body: {} }),
          handleCancel: vi.fn().mockResolvedValue({ status: 200, body: {} }),
          handleListActiveRuns: vi.fn().mockResolvedValue({ status: 200, body: { runs: [] } }),
        };
      }
    },
  };
});

vi.mock('@ninja/arsenal-registry', () => ({
  bootstrap: vi.fn().mockReturnValue({ listTools: () => [], listSkills: () => [] }),
}));

import { createServer } from '../server.js';

function expectedOperatorId(key: string): string {
  return `operator-${createHash('sha256').update(key).digest('hex').slice(0, 12)}`;
}

// Auditoría P0 bug #2 (Ley 6): el approver debe derivarse de la key autenticada.
// Antes era hardcodeado `api-user/admin` → aprobaciones no atribuibles.
describe('Real approver identity (Ley 6)', () => {
  let server: any;

  beforeAll(async () => {
    server = await createServer();
  });

  afterAll(async () => {
    if (server) await server.close();
  });

  it('approve con key A registra approver operator-<fingerprintA> con rol operator', async () => {
    sentinelMocks.approveRequest.mockClear();
    const res = await server.inject({
      method: 'POST',
      url: '/api/approvals/req-1/approve',
      headers: { 'x-ninja-key': 'key-aaa' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(sentinelMocks.approveRequest).toHaveBeenCalledTimes(1);
    const [, approver] = sentinelMocks.approveRequest.mock.calls[0];
    expect(approver).toEqual({ id: expectedOperatorId('key-aaa'), role: 'operator' });
  });

  it('approve con key B registra un approver DISTINTO al de key A', async () => {
    sentinelMocks.approveRequest.mockClear();
    await server.inject({
      method: 'POST',
      url: '/api/approvals/req-2/approve',
      headers: { 'x-ninja-key': 'key-bbb' },
      payload: {},
    });
    const [, approverB] = sentinelMocks.approveRequest.mock.calls[0];
    expect(approverB.id).toBe(expectedOperatorId('key-bbb'));
    expect(approverB.id).not.toBe(expectedOperatorId('key-aaa'));
  });

  it('reject también usa la identidad derivada de la key', async () => {
    sentinelMocks.rejectRequest.mockClear();
    const res = await server.inject({
      method: 'POST',
      url: '/api/approvals/req-3/reject',
      headers: { 'x-ninja-key': 'key-ccc' },
      payload: { reason: 'no cumple política' },
    });
    expect(res.statusCode).toBe(200);
    const [, approver] = sentinelMocks.rejectRequest.mock.calls[0];
    expect(approver).toEqual({ id: expectedOperatorId('key-ccc'), role: 'operator' });
  });

  it('sin header X-Ninja-Key deriva fingerprint del string vacío (determinista, nunca api-user)', async () => {
    sentinelMocks.approveRequest.mockClear();
    await server.inject({
      method: 'POST',
      url: '/api/approvals/req-4/approve',
      payload: {},
    });
    const [, approver] = sentinelMocks.approveRequest.mock.calls[0];
    expect(approver.id).toBe(expectedOperatorId(''));
    expect(approver.id).not.toBe('api-user');
  });
});
