/**
 * Tests de health granular (WP-C3a / F2.1).
 * Patrón: fastify inject sobre un servidor mínimo con las rutas de health
 * registradas (mismo patrón que error-handler.test.ts pero sin server completo).
 *
 * Caso crítico del plan: DB inaccesible → /health/ready 503 y /health 200.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fastify from 'fastify';
import Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import type { Database as Db } from 'better-sqlite3';
import type { NinjaEvent, HealthReadyChangedPayload } from '@ninja/contracts';
import { runMigrations } from '@ninja/storage';
import { WORKSPACE_MIGRATIONS } from '@ninja/workbench';
import { registerHealthRoutes } from './health.js';

vi.mock('@ninja/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ninja/events')>();
  // EventBus aislado para asserts; el singleton real no se toca en estos tests.
  const isolated = new actual.EventBus();
  return { ...actual, eventBus: isolated };
});

const ENV_OK = {
  LLM_BASE_URL: 'http://localhost:11434/v1',
  LLM_API_KEY: 'test-key-123456',
};

describe('Health granular (WP-C3a)', () => {
  let server: FastifyInstance;
  let db: Db;
  let readyEvents: NinjaEvent<HealthReadyChangedPayload>[];

  const buildServer = (database: Db, env = ENV_OK): FastifyInstance => {
    const app = fastify({ logger: false });
    registerHealthRoutes(app, {
      db: database,
      env,
      expectedMigrations: WORKSPACE_MIGRATIONS.length,
    });
    return app;
  };

  beforeAll(async () => {
    const { eventBus } = await import('@ninja/events');
    readyEvents = [];
    eventBus.on('health.ready.changed', (event: NinjaEvent) => {
      readyEvents.push(event as NinjaEvent<HealthReadyChangedPayload>);
    });

    db = new Database(':memory:');
    runMigrations(db, WORKSPACE_MIGRATIONS);
    server = buildServer(db);
  });

  afterAll(async () => {
    if (server) await server.close();
    if (db && db.open) db.close();
  });

  it('GET /health → 200 liveness (sin tocar DB, siempre ok)', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.timestamp).toBe('string');
  });

  it('GET /health/ready → 200 ready con DB migrada y env LLM presente', async () => {
    const res = await server.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ready');
    expect(body.checks).toEqual({ db: true, migrations: true, llmEnv: true });
  });

  it('DB inaccesible (conexión cerrada) → /health/ready 503 y /health 200', async () => {
    const brokenDb = new Database(':memory:');
    runMigrations(brokenDb, WORKSPACE_MIGRATIONS);
    brokenDb.close(); // conexión cerrada = probe SELECT 1 y migraciones fallan

    const app = buildServer(brokenDb);
    try {
      const ready = await app.inject({ method: 'GET', url: '/health/ready' });
      expect(ready.statusCode).toBe(503);
      const readyBody = JSON.parse(ready.payload);
      expect(readyBody.status).toBe('not-ready');
      expect(readyBody.checks.db).toBe(false);
      expect(readyBody.checks.migrations).toBe(false);
      expect(readyBody.checks.llmEnv).toBe(true);

      const live = await app.inject({ method: 'GET', url: '/health' });
      expect(live.statusCode).toBe(200);
      expect(JSON.parse(live.payload).status).toBe('ok');
    } finally {
      await app.close();
    }
  });

  it('Migraciones pendientes → 503 con checks.migrations false (DB viva)', async () => {
    const freshDb = new Database(':memory:'); // sin ejecutar migraciones
    const app = buildServer(freshDb);
    try {
      const res = await app.inject({ method: 'GET', url: '/health/ready' });
      expect(res.statusCode).toBe(503);
      const body = JSON.parse(res.payload);
      expect(body.checks.db).toBe(true);
      expect(body.checks.migrations).toBe(false);
      expect(body.checks.llmEnv).toBe(true);
    } finally {
      await app.close();
      freshDb.close();
    }
  });

  it('Env LLM ausente → 503 con checks.llmEnv false', async () => {
    const app = buildServer(db, { LLM_BASE_URL: '', LLM_API_KEY: '' });
    try {
      const res = await app.inject({ method: 'GET', url: '/health/ready' });
      expect(res.statusCode).toBe(503);
      const body = JSON.parse(res.payload);
      expect(body.checks.db).toBe(true);
      expect(body.checks.migrations).toBe(true);
      expect(body.checks.llmEnv).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('Emite health.ready.changed solo en transición, no en cada request', async () => {
    // App dedicado: el estado lastReadyState vive dentro del módulo de rutas,
    // así que la secuencia de transiciones debe probarse desde cero.
    const steadyDb = new Database(':memory:');
    runMigrations(steadyDb, WORKSPACE_MIGRATIONS);
    const app = buildServer(steadyDb);
    readyEvents.length = 0;
    try {
      // 1er request: null → ready (transición #1)
      await app.inject({ method: 'GET', url: '/health/ready' });
      // 2do request: ready → ready (sin transición)
      await app.inject({ method: 'GET', url: '/health/ready' });
      // 3er request: ready → ready (sin transición)
      await app.inject({ method: 'GET', url: '/health/ready' });

      expect(readyEvents.length).toBe(1);
      expect(readyEvents[0].type).toBe('health.ready.changed');
      expect(readyEvents[0].payload.ready).toBe(true);
      expect(readyEvents[0].payload.previous).toBe(null);
      expect(readyEvents[0].payload.checks).toEqual({ db: true, migrations: true, llmEnv: true });
      expect(readyEvents[0].source).toBe('kage-runtime');
    } finally {
      await app.close();
      steadyDb.close();
    }
  });

  it('Flips reales emiten eventos con payload de transición correcto', async () => {
    const flippingDb = new Database(':memory:');
    runMigrations(flippingDb, WORKSPACE_MIGRATIONS);
    const app = buildServer(flippingDb);
    readyEvents.length = 0;
    try {
      // null → ready
      const first = await app.inject({ method: 'GET', url: '/health/ready' });
      expect(first.statusCode).toBe(200);
      expect(readyEvents.length).toBe(1);
      expect(readyEvents[0].payload.ready).toBe(true);

      // ready → not-ready: cerramos la conexión bajo los pies del handler
      flippingDb.close();
      const second = await app.inject({ method: 'GET', url: '/health/ready' });
      expect(second.statusCode).toBe(503);
      expect(readyEvents.length).toBe(2);
      expect(readyEvents[1].payload.ready).toBe(false);
      expect(readyEvents[1].payload.previous).toBe(true);
      expect(readyEvents[1].payload.checks.db).toBe(false);
    } finally {
      await app.close();
    }
  });
});
