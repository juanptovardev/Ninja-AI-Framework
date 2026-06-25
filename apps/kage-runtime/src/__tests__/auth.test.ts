import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.stubEnv('LLM_BASE_URL', 'http://localhost:11434/v1');
vi.stubEnv('LLM_API_KEY', 'test-key-auth');
vi.stubEnv('LLM_DEFAULT_MODEL', 'gpt-4o-mini');
vi.stubEnv('NINJA_AUTH_DISABLED', 'false');

// Mock auth-key to return a deterministic test key
vi.mock('../auth-key.js', () => ({
  getOrCreateRuntimeKey: () => 'test-runtime-key-64hex',
  getRuntimeKeyPath: () => '/tmp/.ninja/runtime.key',
}));

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

const VALID_KEY = 'test-runtime-key-64hex';

describe('API Key auth (WP-B11)', () => {
  let server: any;

  beforeAll(async () => {
    server = await createServer();
  });

  afterAll(async () => {
    if (server) await server.close();
  });

  describe('HTTP auth', () => {
    it('/health accesible sin X-Ninja-Key (ruta pública)', async () => {
      const res = await server.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
    });

    it('/api/status accesible sin X-Ninja-Key (ruta pública)', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/status' });
      expect(res.statusCode).toBe(200);
    });

    it('ruta protegida sin key → 401', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/roster' });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('AUTH_REQUIRED');
    });

    it('ruta protegida con key inválida → 401', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/roster',
        headers: { 'x-ninja-key': 'wrong-key' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('ruta protegida con key válida → 200', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/roster',
        headers: { 'x-ninja-key': VALID_KEY },
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
