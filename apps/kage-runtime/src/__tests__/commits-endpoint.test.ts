/**
 * @ninja/kage-runtime — commits-endpoint.test.ts
 * Tests for GET /api/commits endpoint (RF-16)
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.stubEnv('LLM_BASE_URL', 'http://localhost:11434/v1');
vi.stubEnv('LLM_API_KEY', 'test-key');
vi.stubEnv('LLM_DEFAULT_MODEL', 'gpt-4o-mini');
vi.stubEnv('NINJA_AUTH_DISABLED', 'true');

import { createServer } from '../server.js';

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
      constructor() { return mockEngine; }
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
  bootstrap: vi.fn().mockReturnValue({ listTools: () => [], listSkills: () => [] }),
}));

describe('GET /api/commits (RF-16)', () => {
  let server: any;

  beforeAll(async () => {
    server = await createServer();
  });

  afterAll(async () => {
    if (server) await server.close();
  });

  it('returns 200 with an array', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/commits' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
  });

  it('accepts runId query param', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/commits?runId=nonexistent' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it('accepts limit query param', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/commits?limit=5' });
    expect(res.statusCode).toBe(200);
  });
});
