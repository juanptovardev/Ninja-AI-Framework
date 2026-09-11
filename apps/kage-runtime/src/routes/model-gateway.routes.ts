/**
 * apps/kage-runtime — routes/model-gateway.routes.ts
 * Rutas del Model Gateway & Budget (WP-D4 2/2).
 *
 * Extraídas de server.ts (composition root) sin cambiar comportamiento:
 * - GET /api/model-gateway/status → catálogo, estrategia y uso global
 * - GET /api/budget/status        → uso global/sesión + límite (WP-B4)
 */
import type { FastifyInstance } from 'fastify';
import type { BudgetManager, ModelCatalog } from '@ninja/model-gateway';

export interface ModelGatewayRouteDeps {
  modelCatalog: ModelCatalog;
  modelBudgetManager: BudgetManager;
  /** Límite de tokens por sesión (env NINJA_SESSION_TOKEN_BUDGET, WP-B4). */
  sessionTokenBudget?: number;
}

export function registerModelGatewayRoutes(
  server: FastifyInstance,
  deps: ModelGatewayRouteDeps
): void {
  const { modelCatalog, modelBudgetManager, sessionTokenBudget } = deps;

  server.get('/api/model-gateway/status', async (_request, reply) => {
    return reply.send({
      catalogSize: modelCatalog.getAll().length,
      activeStrategy: 'dynamic-hybrid',
      stats: modelBudgetManager.getGlobalUsage(),
    });
  });

  server.get('/api/budget/status', async (request, reply) => {
    const { sessionId } = request.query as { sessionId?: string };
    return reply.send({
      global: modelBudgetManager.getGlobalUsage(),
      session: sessionId ? (modelBudgetManager.getSessionSummary(sessionId) ?? null) : null,
      limit: sessionTokenBudget ?? null,
    });
  });
}
