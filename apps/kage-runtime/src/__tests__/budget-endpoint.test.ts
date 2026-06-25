/**
 * @ninja/kage-runtime — budget-endpoint.test.ts
 * Tests for GET /api/budget/status endpoint (WP-B4)
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';

vi.stubEnv('LLM_BASE_URL', 'http://localhost:11434/v1');
vi.stubEnv('LLM_API_KEY', 'test-key');
vi.stubEnv('LLM_DEFAULT_MODEL', 'gpt-4o-mini');
vi.stubEnv('NINJA_AUTH_DISABLED', 'true');

import { createServer } from '../server.js';

// Same mocks as server.test.ts
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
    KageEngine: class {
      constructor() {
        return mockEngine;
      }
    },
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
  bootstrap: vi.fn().mockReturnValue({
    listTools: () => [],
    listSkills: () => [],
  }),
}));

describe('GET /api/budget/status (WP-B4)', () => {
  let server: any;

  beforeAll(async () => {
    server = await createServer();
  });

  afterAll(async () => {
    if (server) await server.close();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with global, session, limit fields', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/budget/status',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toHaveProperty('global');
    expect(body).toHaveProperty('session');
    expect(body).toHaveProperty('limit');
  });

  it('without sessionId query param → session is null', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/budget/status',
    });

    const body = JSON.parse(response.payload);
    expect(body.session).toBeNull();
  });

  it('with sessionId=s1 → session field reflects that session (null if not found)', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/budget/status?sessionId=s1',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toHaveProperty('session');
    // BudgetManager returns undefined for unknown session → endpoint returns null
    expect(body.session).toBeNull();
  });

  it('global field has expected shape (totalPrompt, totalCompletion, estimatedCost, modelBreakdown)', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/budget/status',
    });

    const body = JSON.parse(response.payload);
    expect(body.global).toHaveProperty('totalPrompt');
    expect(body.global).toHaveProperty('totalCompletion');
    expect(body.global).toHaveProperty('estimatedCost');
    expect(body.global).toHaveProperty('modelBreakdown');
  });
});
