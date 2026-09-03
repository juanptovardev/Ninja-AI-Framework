/**
 * apps/kage-runtime — routes/health.ts
 * Health granular (WP-C3a / F2.1): liveness + readiness según QUALITY_MANUAL §7.4.
 *
 * - GET /health       → liveness: estático, rápido, sin tocar DB ni env.
 * - GET /health/ready → readiness: probe SQLite (`SELECT 1` vía storage), migraciones
 *   aplicadas y env LLM presente. 200 "ready" | 503 "not-ready".
 *
 * Emite `health.ready.changed` por el eventBus SOLO en transición
 * (ready → not-ready o viceversa), nunca en cada request.
 */
import type { FastifyInstance } from 'fastify';
import type { Database } from 'better-sqlite3';
import type { HealthResponse, ReadinessResponse, ReadyChecks } from '@ninja/contracts';
import { eventBus, createEvent } from '@ninja/events';
import { createLogger } from '@ninja/logging';

const log = createLogger('kage-runtime:routes:health');

export interface HealthDeps {
  /** Conexión SQLite de storage (la misma que usa el runtime). */
  db: Database;
  /** Env validado en boot (ADR-0004) — se usan LLM_BASE_URL y LLM_API_KEY. */
  env: {
    LLM_BASE_URL?: string;
    LLM_API_KEY?: string;
  };
  /** Número de migraciones esperadas (ids contiguos 1..N) para el check de migraciones. */
  expectedMigrations: number;
}

/** Ejecuta `SELECT 1` sobre la conexión SQLite. false si la conexión está rota/cerrada. */
export function probeDb(db: Database): boolean {
  try {
    db.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifica que las migraciones registradas estén aplicadas: el conjunto de ids
 * en la tabla __migrations debe cubrir todas las migraciones conocidas.
 */
export function probeMigrations(db: Database, expectedCount: number): boolean {
  try {
    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__migrations'")
      .get();
    if (!table) return false;
    const applied = db.prepare('SELECT id FROM __migrations').all() as { id: number }[];
    const appliedIds = new Set(applied.map((row) => row.id));
    for (let id = 1; id <= expectedCount; id++) {
      if (!appliedIds.has(id)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Env LLM presente: LLM_BASE_URL y LLM_API_KEY no vacíos. */
export function probeLlmEnv(env: HealthDeps['env']): boolean {
  return Boolean(env.LLM_BASE_URL && env.LLM_API_KEY);
}

/** Calcula los checks de readiness. Exportada para reuso/test unitario directo. */
export function computeReadyChecks(
  db: Database,
  env: HealthDeps['env'],
  expectedMigrations: number
): ReadyChecks {
  return {
    db: probeDb(db),
    migrations: probeMigrations(db, expectedMigrations),
    llmEnv: probeLlmEnv(env),
  };
}

/**
 * Registra las rutas de health granular.
 * Nota de wiring: esta función reemplaza al handler inline de `/health` que
 * vivía en server.ts (el inline se elimina en el mismo WP para no duplicar la ruta).
 */
export function registerHealthRoutes(server: FastifyInstance, deps: HealthDeps): void {
  const { db, env, expectedMigrations } = deps;

  // ── Liveness (§7.4): estático, rápido, sin dependencias ────────────────────
  server.get('/health', async (): Promise<HealthResponse> => {
    log.debug('Liveness check requested');
    return { status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() };
  });

  // ── Readiness (§7.4): probes reales, evento solo en transición ─────────────
  let lastReadyState: boolean | null = null;

  server.get('/health/ready', async (_request, reply): Promise<ReadinessResponse> => {
    const checks = computeReadyChecks(db, env, expectedMigrations);
    const ready = checks.db && checks.migrations && checks.llmEnv;

    // Transición: solo emitir cuando el estado flipa (primera evaluación cuenta).
    if (lastReadyState === null || ready !== lastReadyState) {
      eventBus.emit(
        createEvent('health.ready.changed', 'kage-runtime', {
          ready,
          previous: lastReadyState,
          checks,
        })
      );
      log.info(`Readiness flipped: ${String(lastReadyState)} → ${String(ready)}`, checks);
      lastReadyState = ready;
    }

    const body: ReadinessResponse = {
      status: ready ? 'ready' : 'not-ready',
      timestamp: new Date().toISOString(),
      checks,
    };
    return reply.code(ready ? 200 : 503).send(body);
  });
}
