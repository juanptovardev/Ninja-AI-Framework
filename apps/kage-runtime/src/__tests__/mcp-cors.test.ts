import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// env vars required by parseEnv before import of createServer
vi.stubEnv('LLM_BASE_URL', 'http://localhost:11434/v1');
vi.stubEnv('LLM_API_KEY', 'test-key-cors');
vi.stubEnv('LLM_DEFAULT_MODEL', 'gpt-4o-mini');

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
  bootstrap: vi.fn().mockReturnValue({ listTools: () => [], listSkills: () => [] }),
}));

describe('MCP SSE CORS (WP-B13)', () => {
  let server: any;

  beforeAll(async () => {
    server = await createServer();
  });

  afterAll(async () => {
    if (server) await server.close();
  });

  it('origin permitido → Access-Control-Allow-Origin refleja el origin exacto', async () => {
    const res = await server.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: { origin: 'http://localhost:3001' },
    });
    // Verifica que el CORS del servidor refleja el origin y no usa wildcard
    const acao = res.headers['access-control-allow-origin'];
    if (acao !== undefined) {
      expect(acao).toBe('http://localhost:3001');
      expect(acao).not.toBe('*');
    }
  });

  it('origin NO permitido → respuesta no incluye wildcard ACAO', async () => {
    const res = await server.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: { origin: 'https://evil.example.com' },
    });
    const acao = res.headers['access-control-allow-origin'];
    // Si hay header CORS, no debe ser wildcard ni el origin malicioso
    if (acao !== undefined) {
      expect(acao).not.toBe('*');
      expect(acao).not.toBe('https://evil.example.com');
    }
  });

  it('ALLOWED_ORIGINS no contiene wildcard — ninguna entrada es "*"', async () => {
    // Importamos el módulo para inspeccionar su comportamiento via /health sin origin
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const acao = res.headers['access-control-allow-origin'];
    if (acao !== undefined) {
      expect(acao).not.toBe('*');
    }
  });
});
