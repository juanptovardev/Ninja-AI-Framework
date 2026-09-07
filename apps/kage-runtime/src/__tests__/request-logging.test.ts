/**
 * Tests del access log con correlationId (WP-F2.7, Manual §7.1/§7.2).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

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

import { createServer } from '../server.js';

interface AccessLogLine {
  msg: string;
  level: string;
  logger: string;
  correlationId: string;
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
  remoteAddress: string;
  [key: string]: unknown;
}

describe('Access log con correlationId (WP-F2.7)', () => {
  let server: Awaited<ReturnType<typeof createServer>>;
  let lines: string[];
  let origLog: typeof console.log;

  beforeAll(async () => {
    // Capturar stdout ANTES de crear el server (access log via createLogger)
    lines = [];
    origLog = console.log;
    console.log = (...args: unknown[]) => lines.push(String(args[0]));
    server = await createServer();
  });

  afterAll(async () => {
    if (server) await server.close();
    console.log = origLog;
  });

  it('cada request genera 1 línea JSON con msg "METHOD url STATUS" y correlationId UUID', async () => {
    lines.length = 0;
    const res = await server.inject({ method: 'GET', url: '/api/status?foo=bar' });
    expect(res.statusCode).toBe(200);

    // Pequeña espera: onResponse hook es async, inject ya espera la respuesta completa.
    const access = lines
      .map((l) => {
        try {
          return JSON.parse(l) as AccessLogLine;
        } catch {
          return null;
        }
      })
      .filter((l): l is AccessLogLine => l !== null && l.logger === 'kage-runtime:access');

    expect(access.length).toBeGreaterThanOrEqual(1);
    const entry = access[access.length - 1];
    expect(entry.msg).toMatch(/^GET \/api\/status\?foo=bar 200$/);
    expect(entry.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry.method).toBe('GET');
    expect(entry.statusCode).toBe(200);
    expect(typeof entry.durationMs).toBe('number');
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    expect(entry.remoteAddress).toBeDefined();
  });

  it('health está excluida del access log (skipPaths), otras rutas no', async () => {
    lines.length = 0;
    await server.inject({ method: 'GET', url: '/health' });
    await server.inject({ method: 'GET', url: '/api/status' });

    const access = lines
      .map((l) => {
        try {
          return JSON.parse(l) as AccessLogLine;
        } catch {
          return null;
        }
      })
      .filter((l): l is AccessLogLine => l !== null && l.logger === 'kage-runtime:access');

    expect(access.some((l) => l.url === '/health')).toBe(false);
    expect(access.some((l) => l.url === '/api/status')).toBe(true);
  });

  it('dos requests → correlationIds distintos (UUID por request, no por proceso)', async () => {
    lines.length = 0;
    await server.inject({ method: 'GET', url: '/api/status' });
    await server.inject({ method: 'GET', url: '/api/status' });

    const ids = lines
      .map((l) => {
        try {
          return JSON.parse(l) as AccessLogLine;
        } catch {
          return null;
        }
      })
      .filter((l): l is AccessLogLine => l !== null && l.logger === 'kage-runtime:access')
      .map((l) => l.correlationId);

    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
