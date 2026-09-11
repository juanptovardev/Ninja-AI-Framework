/**
 * apps/kage-runtime — routes/learning.routes.ts
 * Rutas del Learning Loop (WP-D4 2/2).
 *
 * Extraídas de server.ts (composition root) sin cambiar comportamiento:
 * - GET  /api/learning/candidates      → candidatos cosechados (harvest(7))
 * - POST /api/learning/promote/:id     → evaluar y promocionar un candidato
 */
import type { FastifyInstance } from 'fastify';
import type { LearningEvaluator, LearningHarvester, LearningPromoter } from '@ninja/learning-loop';
import { sanitizeError } from '../sanitize-error.js';

export interface LearningRouteDeps {
  learningHarvester: LearningHarvester;
  learningEvaluator: LearningEvaluator;
  learningPromoter: LearningPromoter;
  /** NODE_ENV validado por parseEnv (ADR-0004) — controla la verbosidad de sanitizeError. */
  nodeEnv: 'development' | 'production' | 'test';
}

export function registerLearningRoutes(server: FastifyInstance, deps: LearningRouteDeps): void {
  const { learningHarvester, learningEvaluator, learningPromoter, nodeEnv } = deps;

  server.get('/api/learning/candidates', async (_request, reply) => {
    const candidates = await learningHarvester.harvest(7);
    return reply.send(candidates);
  });

  server.post<{ Params: { id: string } }>('/api/learning/promote/:id', async (request, reply) => {
    const { id } = request.params;
    try {
      // 1. Obtener candidatos recientemente cosechados
      const candidates = await learningHarvester.harvest(30);
      const candidate = candidates.find((c) => c.runId === id);

      if (!candidate)
        return reply.status(404).send({ error: 'Candidate not found in recent runs' });

      // 2. Evaluar
      const report = learningEvaluator.evaluate(candidate);

      // 3. Promocionar (si el reporte lo recomienda)
      const result = await learningPromoter.promote(report, candidate);

      if (!result.success) {
        return reply.status(500).send({ error: result.error.message });
      }

      return reply.send({
        success: true,
        promoted: report.recommendPromotion,
        score: report.totalScore,
      });
    } catch (err) {
      return reply.status(500).send(sanitizeError(err, nodeEnv));
    }
  });
}
