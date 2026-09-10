/**
 * apps/kage-runtime — routes/engine.routes.ts
 * Rutas de Kage Engine (WP-D4 1/2): entrevista, submit y ciclo de vida de runs.
 *
 * Extraídas de server.ts (composition root) sin cambiar comportamiento:
 * - POST /api/engine/interview            → inicia entrevista
 * - POST /api/engine/interview/:id/answers → respuestas de la entrevista
 * - POST /engine/submit                   → envía trabajo al motor (EngineSubmitSchema)
 * - GET  /engine/run/:id                  → estado de un run
 * - POST /engine/run/:id/approve|pause|resume|cancel
 * - GET  /engine/runs                     → runs activos
 */
import type { FastifyInstance } from 'fastify';
import type { HttpController, HttpRoutes, KageEngine } from '@ninja/kage-engine';
import type { BudgetManager } from '@ninja/model-gateway';
import { EngineSubmitSchema } from '../route-schemas.js';

/**
 * Métodos "soft" de entrevista del KageEngine: pueden no estar implementados.
 * Se ejecutan solo si existen (mismo guard `typeof === 'function'` que el
 * handler inline original en server.ts).
 */
export type EngineInterviewMethods = {
  startInterview?(id: string): Promise<void>;
  submitAnswers?(id: string, answers: unknown): Promise<void>;
};

export interface EngineRouteDeps {
  engine: KageEngine & EngineInterviewMethods;
  httpController: HttpController;
  modelBudgetManager: BudgetManager;
  /** Presupuesto de tokens por sesión (env NINJA_SESSION_TOKEN_BUDGET, WP-B4). */
  sessionTokenBudget?: number;
}

export function registerEngineRoutes(server: FastifyInstance, deps: EngineRouteDeps): void {
  const { engine, httpController, modelBudgetManager, sessionTokenBudget } = deps;

  server.post('/api/engine/interview', async (request, reply) => {
    const id = crypto.randomUUID();
    if (typeof engine.startInterview === 'function') {
      await engine.startInterview(id);
    }
    return reply.send({ id, status: 'started' });
  });

  server.post<{ Params: { id: string } }>(
    '/api/engine/interview/:id/answers',
    async (request, reply) => {
      const { id } = request.params;
      const answers = request.body;
      if (typeof engine.submitAnswers === 'function') {
        await engine.submitAnswers(id, answers);
      }
      return reply.send({ success: true });
    }
  );

  server.post('/engine/submit', async (request, reply) => {
    const parsed = EngineSubmitSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        issues: parsed.error.issues,
      });
    }
    const result = await httpController.handleSubmit({
      body: parsed.data as HttpRoutes['submitRequest']['request']['body'],
    });
    const sessionId = (result.body as { sessionId?: string }).sessionId;
    if (sessionTokenBudget && sessionId) {
      modelBudgetManager.setSessionBudget(sessionId, sessionTokenBudget);
    }
    return reply.status(result.status).send(result.body);
  });

  server.get<{ Params: { id: string } }>('/engine/run/:id', async (request, reply) => {
    const result = await httpController.handleGetRunStatus({
      params: { id: request.params.id },
    });
    return reply.status(result.status).send(result.body);
  });

  server.post<{ Params: { id: string } }>('/engine/run/:id/approve', async (request, reply) => {
    const result = await httpController.handleApprove({
      params: { id: request.params.id },
      body: request.body as HttpRoutes['approveRequest']['request']['body'],
    });
    return reply.status(result.status).send(result.body);
  });

  server.post<{ Params: { id: string } }>('/engine/run/:id/pause', async (request, reply) => {
    const result = await httpController.handlePause({
      params: { id: request.params.id },
    });
    return reply.status(result.status).send(result.body);
  });

  server.post<{ Params: { id: string } }>('/engine/run/:id/resume', async (request, reply) => {
    const result = await httpController.handleResume({
      params: { id: request.params.id },
    });
    return reply.status(result.status).send(result.body);
  });

  server.post<{ Params: { id: string } }>('/engine/run/:id/cancel', async (request, reply) => {
    const result = await httpController.handleCancel({
      params: { id: request.params.id },
    });
    return reply.status(result.status).send(result.body);
  });

  server.get('/engine/runs', async (request, reply) => {
    const result = await httpController.handleListActiveRuns({});
    return reply.status(result.status).send(result.body);
  });
}
