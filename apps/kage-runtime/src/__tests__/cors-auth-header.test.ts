import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.stubEnv('LLM_BASE_URL', 'http://localhost:11434/v1');
vi.stubEnv('LLM_API_KEY', 'test-key');
vi.stubEnv('LLM_DEFAULT_MODEL', 'gpt-4o-mini');
vi.stubEnv('NINJA_AUTH_DISABLED', 'true');

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

// WP-C5 / Auditoría P0 bug #1: CORS allowedHeaders debe incluir X-Ninja-Key
// (header real de auth del onRequest hook). Antes listaba X-Ninja-Session,
// que nadie envía → el browser bloqueaba toda request autenticada (preflight KO).
describe('CORS + X-Ninja-Key (P0 fix)', () => {
  let server: any;

  beforeAll(async () => {
    server = await createServer();
  });

  afterAll(async () => {
    if (server) await server.close();
  });

  it('OPTIONS preflight con Access-Control-Request-Headers: x-ninja-key → allow-headers incluye X-Ninja-Key', async () => {
    const res = await server.inject({
      method: 'OPTIONS',
      url: '/api/status',
      headers: {
        origin: 'http://localhost:3001',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'x-ninja-key',
      },
    });
    expect([200, 204]).toContain(res.statusCode);
    const allowHeaders = String(res.headers['access-control-allow-headers'] ?? '').toLowerCase();
    expect(allowHeaders).toContain('x-ninja-key');
  });

  it('preflight no incluye el header obsoleto X-Ninja-Session', async () => {
    const res = await server.inject({
      method: 'OPTIONS',
      url: '/api/status',
      headers: {
        origin: 'http://localhost:3001',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'x-ninja-key',
      },
    });
    const allowHeaders = String(res.headers['access-control-allow-headers'] ?? '').toLowerCase();
    expect(allowHeaders).not.toContain('x-ninja-session');
  });

  it('GET con X-Ninja-Key desde origin permitido → 200 con access-control-allow-origin', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/status',
      headers: {
        origin: 'http://localhost:3001',
        'x-ninja-key': 'test-key',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3001');
  });
});
