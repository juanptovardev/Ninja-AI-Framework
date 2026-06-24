/**
 * @ninja/kage-runtime — artifacts-anchor-filter.test.ts
 * TDD test for GET /api/artifacts?isAnchor=true filter (WP-B8)
 * isAnchor is implemented as type==='anchor' (no separate column in artifacts table)
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// ── Module mocks (hoisted — no top-level vars allowed inside factory) ──────
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

vi.mock('@ninja/trace-ledger', () => {
  // Inline seed data — no external references allowed inside vi.mock factory
  const seedData = [
    { id: 'art-anchor-1', runId: 'run-1', type: 'anchor', name: 'decision-log', content: '{}', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'art-other-1',  runId: 'run-1', type: 'output', name: 'result',       content: '{}', createdAt: '2026-01-01T00:00:00.000Z' },
  ];
  return {
    SessionRepository: class { create = vi.fn(); findById = vi.fn(); },
    RunRepository: class {
      create = vi.fn();
      updateStatus = vi.fn();
      findById = vi.fn();
      findBySessionId = vi.fn();
      delete = vi.fn();
    },
    ArtifactRepository: class {
      findAll = vi.fn().mockReturnValue(seedData);
      findById = vi.fn().mockReturnValue(seedData[0]);
      create = vi.fn();
      findByRunId = vi.fn().mockReturnValue(seedData);
      findByType = vi.fn().mockReturnValue([seedData[0]]);
    },
  };
});

// ── Import after mocks ─────────────────────────────────────────────────────
import { createServer } from '../server.js';

// ── Tests ──────────────────────────────────────────────────────────────────
describe('WP-B8: GET /api/artifacts?isAnchor=true', () => {
  let server: any;

  beforeAll(async () => {
    server = await createServer();
  });

  afterAll(async () => {
    if (server) await server.close();
  });

  it('returns only artifacts with type==="anchor" when isAnchor=true', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/artifacts?isAnchor=true' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload) as Array<{ type: string }>;
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((a) => a.type === 'anchor')).toBe(true);
  });

  it('does NOT return artifacts with other types when isAnchor=true', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/artifacts?isAnchor=true' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload) as Array<{ type: string; id: string }>;
    expect(body.some((a) => a.type === 'output')).toBe(false);
    expect(body.some((a) => a.id === 'art-other-1')).toBe(false);
  });

  it('returns all artifact types when isAnchor is not set', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/artifacts' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload) as Array<{ type: string }>;
    expect(body.length).toBe(2);
    expect(body.some((a) => a.type === 'anchor')).toBe(true);
    expect(body.some((a) => a.type === 'output')).toBe(true);
  });
});
