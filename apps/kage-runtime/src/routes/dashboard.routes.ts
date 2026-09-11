/**
 * apps/kage-runtime — routes/dashboard.routes.ts
 * Rutas de Dashboard & Settings (WP-D4 2/2).
 *
 * Extraídas de server.ts (composition root) sin cambiar comportamiento:
 * - GET /api/dashboard             → agregado de estado operativo del runtime
 * - GET /api/settings/providers    → proveedores LLM registrados (getAll no existe
 *                                    en LLMRegistry → guard dead → envía [])
 * - GET /api/settings/workspace    → contexto de workspace activo (requireActiveContext)
 */
import type { FastifyInstance } from 'fastify';
import { getDashboardData } from '@ninja/pulse-center';
import { LLMRegistry } from '@ninja/integrations-llm';
import type { ApprovalManager } from '@ninja/sentinel';
import type { KageEngine } from '@ninja/kage-engine';
import type { RunRepository } from '@ninja/trace-ledger';
import { requireActiveContext } from '@ninja/workbench';
import { createLogger } from '@ninja/logging';
import { RUNTIME_VERSION } from '../constants.js';

const log = createLogger('kage-runtime:routes:dashboard');

/**
 * Métodos opcionales que el dashboard original verificaba en runtime
 * (`typeof x.method === 'function'`). Ninguno existe hoy en las clases reales,
 * por lo que el guard preserva exactamente el comportamiento (siempre []).
 */
type DashboardEngine = KageEngine & { getActiveRuns?(): unknown[] };
type DashboardRunRepo = RunRepository & { findRecent?(limit: number): unknown[] };
type DashboardLLMRegistry = LLMRegistry & { getAll?(): unknown[] };

export interface DashboardRouteDeps {
  engine: DashboardEngine;
  approvalManager: ApprovalManager;
  runRepo: DashboardRunRepo;
  /** Provider LLM por defecto derivado de env (LLM_PROVIDER). */
  providerId: string;
  /** Base URL del LLM por defecto (LLM_BASE_URL). */
  baseUrl: string;
}

export function registerDashboardRoutes(server: FastifyInstance, deps: DashboardRouteDeps): void {
  const { engine, approvalManager, runRepo, providerId, baseUrl } = deps;

  server.get('/api/dashboard', async (_request, reply) => {
    try {
      const pulseData = getDashboardData();
      const pendingApprovals = approvalManager.listPendingApprovals();

      // getActiveRuns no existe en KageEngine → guard opcional idéntico al original.
      const activeRuns = engine.getActiveRuns?.() ?? [];
      // findRecent no existe en RunRepository → guard opcional idéntico al original.
      const recentTasks = runRepo.findRecent?.(20) ?? [];

      return reply.send({
        systemState: 'running',
        runsActive: Array.isArray(activeRuns) ? activeRuns.length : 0,
        // DashboardData no expone agentMetrics (Schema.ts) → el acceso original
        // siempre resolvía a 0; se documenta en el dossier WP-D4 2/2.
        agentsActive: 0,
        pendingApprovals: pendingApprovals.length,
        recentTasks: recentTasks,
        pulse: pulseData,
        uptime: process.uptime(),
        version: RUNTIME_VERSION,
      });
    } catch (err: unknown) {
      log.warn('Dashboard endpoint error, returning defaults', err);
      return reply.send({
        systemState: 'running',
        runsActive: 0,
        agentsActive: 0,
        pendingApprovals: 0,
        recentTasks: [],
        pulse: null,
        uptime: process.uptime(),
        version: RUNTIME_VERSION,
      });
    }
  });

  server.get('/api/settings/providers', async (_request, reply) => {
    try {
      const registry: DashboardLLMRegistry = LLMRegistry.getInstance();
      // getAll no existe en LLMRegistry → guard opcional idéntico al original.
      const providers = registry.getAll?.() ?? [];
      return reply.send(providers);
    } catch {
      // Return current env-configured provider as fallback
      return reply.send([
        {
          id: providerId,
          name: providerId,
          baseUrl: baseUrl,
          models: [process.env.LLM_DEFAULT_MODEL || 'unknown'],
          isActive: true,
        },
      ]);
    }
  });

  server.get('/api/settings/workspace', async (_request, reply) => {
    try {
      const ctx = requireActiveContext();
      return reply.send({
        name: ctx.workspace?.name || 'ninja-ai-framework',
        path: ctx.workspace?.path || process.cwd(),
        createdAt: ctx.workspace?.createdAt || new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
      });
    } catch {
      return reply.send({
        name: 'ninja-ai-framework',
        path: process.cwd(),
        createdAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
      });
    }
  });
}
