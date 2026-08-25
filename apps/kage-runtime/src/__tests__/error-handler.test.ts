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

describe('Global error handler (WP-C1)', () => {
  let server: any;

  beforeAll(async () => {
    server = await createServer();
  });

  afterAll(async () => {
    if (server) await server.close();
  });

  it('ruta inexistente → 404 con código NOT_FOUND y path', async () => {
    const res = await server.inject({ method: 'GET', url: '/ruta/que/no/existe' });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('NOT_FOUND');
    expect(body.path).toBe('/ruta/que/no/existe');
  });

  it('GET /api/status → 200 (ruta válida no afectada por setNotFoundHandler)', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/status' });
    expect(res.statusCode).toBe(200);
  });

  it('POST /engine/submit con body inválido → 400 VALIDATION_ERROR + issues', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/engine/submit',
      payload: { noPromptField: true },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it('POST /engine/submit con body completamente vacío → 400', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/engine/submit',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBeDefined();
  });

  it('/health → 200 (ruta pública no interceptada por not-found)', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });

  it('404 response nunca incluye stack trace', async () => {
    const res = await server.inject({ method: 'DELETE', url: '/no/existe/tampoco' });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(JSON.stringify(body)).not.toContain('at ');
    expect(body.stack).toBeUndefined();
  });
});
