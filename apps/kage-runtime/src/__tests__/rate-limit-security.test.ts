/**
 * Tests rate limiting + security headers (WP-C4c / F2.6, ADR-0012).
 *
 * Caso de aceptación del plan:
 * - 101ª request → 429 (global 100/min por X-Ninja-Key)
 * - headers X-Content-Type-Options presentes
 * - /api/shell/execute con override 10/min
 *
 * NOTA de orden: el rate limit global (100/min) y el de shell (route-level,
 * bucket separado) comparten proceso — el test exhaustivo de la 101ª va primero
 * con el presupuesto global virgen (100 exactas → 200, 101ª → 429).
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

describe('Rate limiting + security headers (WP-C4c / F2.6)', () => {
  let server: Awaited<ReturnType<typeof createServer>>;

  beforeAll(async () => {
    server = await createServer();
  });

  afterAll(async () => {
    if (server) await server.close();
  });

  it('101ª request → 429 con formato de error del runtime (code RATE_LIMITED)', async () => {
    // Presupuesto global virgen: exactamente 100 requests pasan…
    for (let i = 0; i < 100; i++) {
      const res = await server.inject({ method: 'GET', url: '/api/status' });
      expect(res.statusCode).toBe(200);
    }
    // …y la 101ª recibe 429 (criterio del plan).
    const over = await server.inject({ method: 'GET', url: '/api/status' });
    expect(over.statusCode).toBe(429);
    const body = JSON.parse(over.payload);
    expect(body.code).toBe('RATE_LIMITED');
    expect(body.statusCode).toBe(429);
    expect(over.headers['x-ratelimit-limit']).toBe('100');
    expect(over.headers['x-ratelimit-remaining']).toBe('0');
  }, 30_000);

  it('429 en la 11ª request de /api/shell/execute (override 10/min route-level)', async () => {
    // Comando bloqueado por validación (403) — consume intentos sin ejecutar nada.
    // El bucket de la ruta es independiente del global (route-level config).
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await server.inject({
        method: 'POST',
        url: '/api/shell/execute',
        payload: { cmd: 'definitely-blocked-cmd-xyz', args: [], cwd: process.cwd() },
      });
      statuses.push(res.statusCode);
    }
    // Las 10 primeras pasan el límite de ruta (403 validación), la 11ª recibe 429.
    expect(statuses.slice(0, 10).every((s) => s !== 429)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect(
      JSON.parse(
        (
          await server.inject({
            method: 'POST',
            url: '/api/shell/execute',
            payload: { cmd: 'x', args: [], cwd: process.cwd() },
          })
        ).payload
      ).code
    ).toBe('RATE_LIMITED');
  }, 20_000);

  it('security headers de helmet presentes (X-Content-Type-Options entre ellos)', async () => {
    // El presupuesto global ya está agotado por el test 1 — esta request responde
    // 429, pero las cabeceras de helmet se aplican vía hook onSend a TODAS las
    // respuestas (es el mismo contracto que una 200 de /health en producción,
    // donde el consumo normal nunca alcanza 100/min).
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['referrer-policy']).toBeDefined();
    expect(res.headers['x-dns-prefetch-control']).toBeDefined();
  });

  it('200 de /health lleva las mismas cabeceras (servidor con budget fresco)', async () => {
    // Instancia aparte para validar los headers sobre una respuesta 200 sin
    // depender del presupuesto global consumido por el test anterior.
    const fresh = await createServer();
    try {
      const res = await fresh.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['referrer-policy']).toBeDefined();
    } finally {
      await fresh.close();
    }
  });
});
