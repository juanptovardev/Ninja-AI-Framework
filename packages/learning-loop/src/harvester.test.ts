/**
 * Tests del LearningHarvester (T5.3, D3).
 *
 * Criterio del plan: recolecta runs del Trace Ledger y produce candidatos de
 * aprendizaje. Storage real: SQLite :memory: con repos de @ninja/trace-ledger.
 * eventBus mockeado con tests/helpers/mock-event-bus.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, closeDb } from '@ninja/storage';
import type { Database } from '@ninja/storage';
import { RunRepository, ArtifactRepository, SessionRepository } from '@ninja/trace-ledger';
import type { Run, RunStatus, Session } from '@ninja/trace-ledger';
import { logAgentResult, getAgentLogs } from '@ninja/trace-ledger';
import { eventBus } from '@ninja/events';
import { setGlobalLogLevel } from '@ninja/logging';
import type { LogLevel } from '@ninja/logging';
import { MockEventBus } from '../../../tests/helpers/mock-event-bus.js';
import { LearningHarvester } from './harvester.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** DDL del Trace Ledger (migraciones 1-4) SIN cláusulas FK para permitir runs huérfanos. */
const TRACE_DDL = `
  CREATE TABLE workspaces (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY, workspaceId TEXT NOT NULL, startedAt TEXT NOT NULL, endedAt TEXT
  );
  CREATE TABLE runs (
    id TEXT PRIMARY KEY, sessionId TEXT NOT NULL, mode TEXT NOT NULL,
    status TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );
  CREATE TABLE artifacts (
    id TEXT PRIMARY KEY, runId TEXT NOT NULL, type TEXT NOT NULL,
    name TEXT NOT NULL, content TEXT NOT NULL, createdAt TEXT NOT NULL
  );
  CREATE TABLE agent_log (
    agentId TEXT NOT NULL, role TEXT NOT NULL, summary TEXT NOT NULL,
    runId TEXT NOT NULL, timestamp TEXT NOT NULL
  );
`;

interface TestContext {
  db: Database.Database;
  runRepository: RunRepository;
  artifactRepository: ArtifactRepository;
  sessionRepository: SessionRepository;
  mockEventBus: MockEventBus;
  harvester: LearningHarvester;
}

function makeContext(): TestContext {
  const db = initDb(':memory:');
  db.exec(TRACE_DDL);
  db.prepare(
    'INSERT INTO workspaces (id, name, path, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)'
  ).run(
    'ws-1',
    'dojo',
    'C:/workspaces/dojo',
    '2026-09-01T00:00:00.000Z',
    '2026-09-01T00:00:00.000Z'
  );

  const runRepository = new RunRepository(db);
  const artifactRepository = new ArtifactRepository(db);
  const sessionRepository = new SessionRepository(db);
  const mockEventBus = new MockEventBus();
  const harvester = new LearningHarvester({
    runRepository,
    artifactRepository,
    sessionRepository,
    agentLogLookup: (runId) => getAgentLogs(db, runId),
    eventBus: mockEventBus as unknown as typeof eventBus,
  });
  return { db, runRepository, artifactRepository, sessionRepository, mockEventBus, harvester };
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

/** Crea un run huérfano (sin sesión) con updatedAt relativo a ahora. */
function seedOrphanRun(ctx: TestContext, status: RunStatus, updatedAtDaysAgo: number): Run {
  const run = ctx.runRepository.create({ sessionId: 'ghost-session', mode: 'build', status });
  ctx.db
    .prepare('UPDATE runs SET updatedAt = ? WHERE id = ?')
    .run(daysAgoIso(updatedAtDaysAgo), run.id);
  return run;
}

/** Crea sesión + run completado con updatedAt relativo a ahora. */
function seedCompletedRun(
  ctx: TestContext,
  updatedAtDaysAgo: number
): { session: Session; run: Run } {
  const session = ctx.sessionRepository.create({
    workspaceId: 'ws-1',
    startedAt: '2026-09-01T00:00:00.000Z',
  });
  const run = ctx.runRepository.create({
    sessionId: session.id,
    mode: 'build',
    status: 'completed',
  });
  ctx.db
    .prepare('UPDATE runs SET updatedAt = ? WHERE id = ?')
    .run(daysAgoIso(updatedAtDaysAgo), run.id);
  return { session, run };
}

describe('LearningHarvester — recolecta runs y produce candidatos', () => {
  let ctx: TestContext;
  let prevLogLevel: LogLevel;

  beforeEach(() => {
    prevLogLevel = 'info';
    setGlobalLogLevel('error'); // silencia logs info del harvester en el runner
    ctx = makeContext();
  });

  afterEach(() => {
    closeDb(ctx.db);
    ctx.mockEventBus.clear();
    setGlobalLogLevel(prevLogLevel);
  });

  it('runs completados sin agent_log → agentId cae al sessionId del run (EV-27)', async () => {
    const { run } = seedCompletedRun(ctx, 1);
    ctx.artifactRepository.create({
      runId: run.id,
      type: 'code',
      name: 'impl',
      content: 'export const app = () => 1;',
    });

    const candidates = await ctx.harvester.harvest();

    expect(candidates).toHaveLength(1);
    const c = candidates[0];
    expect(c.runId).toBe(run.id);
    // EV-27: el agentId NUNCA es el workspaceId de la sesión ('ws-1').
    expect(c.agentId).toBe(run.sessionId);
    expect(c.agentId).not.toBe('ws-1');
    expect(c.taskType).toBe('build');
    expect(c.result).toBe('export const app = () => 1;');
    expect(c.qualityScore).toBe(0);
  });

  it('EV-27 regresión: run con agent_log usa el agentId REAL del agente (≠ workspaceId)', async () => {
    const { session, run } = seedCompletedRun(ctx, 1);
    ctx.artifactRepository.create({
      runId: run.id,
      type: 'code',
      name: 'impl',
      content: 'export const app = () => 1;',
    });
    logAgentResult(ctx.db, {
      agentId: 'ninja-coder',
      role: 'coder',
      summary: 'run completado',
      runId: run.id,
      timestamp: new Date().toISOString(),
    });

    const candidates = await ctx.harvester.harvest();

    expect(candidates).toHaveLength(1);
    const c = candidates[0];
    expect(c.runId).toBe(run.id);
    expect(c.agentId).toBe('ninja-coder');
    expect(c.agentId).not.toBe(session.workspaceId);
    expect(c.agentId).not.toBe(run.sessionId);
  });

  it('filtra por status: solo completed cosecha (failed/running/pending excluidos)', async () => {
    seedOrphanRun(ctx, 'completed', 0);
    seedOrphanRun(ctx, 'failed', 0);
    seedOrphanRun(ctx, 'running', 0);
    seedOrphanRun(ctx, 'pending', 0);
    seedOrphanRun(ctx, 'cancelled', 0);

    const candidates = await ctx.harvester.harvest(7);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].taskType).toBe('build');
  });

  it('filtra por fecha: run actualizado hace 30 días excluido con 7 días, incluido con 60', async () => {
    const old = seedOrphanRun(ctx, 'completed', 30);

    const within7 = await ctx.harvester.harvest(7);
    expect(within7).toHaveLength(0);

    const within60 = await ctx.harvester.harvest(60);
    expect(within60).toHaveLength(1);
    expect(within60[0].runId).toBe(old.id);
  });

  it('harvest() sin argumentos usa la ventana de 7 días por defecto', async () => {
    seedOrphanRun(ctx, 'completed', 8);
    const candidates = await ctx.harvester.harvest();
    expect(candidates).toHaveLength(0);
  });

  it('solo artifacts de tipo code/template/plan alimentan el resultado (join con ---)', async () => {
    const { run } = seedCompletedRun(ctx, 0);
    ctx.artifactRepository.create({
      runId: run.id,
      type: 'code',
      name: 'a.ts',
      content: 'CODE-A',
    });
    ctx.artifactRepository.create({
      runId: run.id,
      type: 'test',
      name: 'a.test.ts',
      content: 'TEST-B (no debe aparecer)',
    });
    ctx.artifactRepository.create({
      runId: run.id,
      type: 'template',
      name: 't',
      content: 'TPL-C',
    });
    ctx.artifactRepository.create({
      runId: run.id,
      type: 'plan',
      name: 'p',
      content: 'PLAN-D',
    });

    const candidates = await ctx.harvester.harvest();
    expect(candidates[0].result).toBe('CODE-A\n---\nTPL-C\n---\nPLAN-D');
  });

  it('resultado truncado a 2000 chars', async () => {
    const { run } = seedCompletedRun(ctx, 0);
    ctx.artifactRepository.create({
      runId: run.id,
      type: 'code',
      name: 'big.ts',
      content: 'x'.repeat(3000),
    });

    const candidates = await ctx.harvester.harvest();
    expect(candidates[0].result).toHaveLength(2000);
  });

  it('sin artifacts relevantes → placeholder "[No artifacts with code/template/plan]"', async () => {
    const { run } = seedCompletedRun(ctx, 0);
    ctx.artifactRepository.create({
      runId: run.id,
      type: 'log',
      name: 'run.log',
      content: 'solo logs',
    });

    const candidates = await ctx.harvester.harvest();
    expect(candidates[0].result).toBe('[No artifacts with code/template/plan]');
  });

  it('sesión inexistente → agentId cae al sessionId del run', async () => {
    seedOrphanRun(ctx, 'completed', 0);

    const candidates = await ctx.harvester.harvest();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].agentId).toBe('ghost-session');
  });

  it('emite learning.harvest.completed con count = candidatos y timestamp ISO', async () => {
    seedCompletedRun(ctx, 0);
    seedOrphanRun(ctx, 'completed', 0);

    await ctx.harvester.harvest(7);

    const events = ctx.mockEventBus.getEvents('learning.harvest.completed');
    expect(events).toHaveLength(1);
    const payload = events[0].payload as { count: number; harvestedAt: string };
    expect(payload.count).toBe(2);
    expect(payload.harvestedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('sin runs completados → sin candidatos y sin evento con count > 0', async () => {
    seedOrphanRun(ctx, 'failed', 0);

    const candidates = await ctx.harvester.harvest();
    expect(candidates).toHaveLength(0);
    const events = ctx.mockEventBus.getEvents('learning.harvest.completed');
    expect(events).toHaveLength(1);
    const payload = events[0].payload as { count: number };
    expect(payload.count).toBe(0);
  });
});
