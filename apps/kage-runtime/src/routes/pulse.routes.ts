/**
 * apps/kage-runtime — routes/pulse.routes.ts
 * Rutas del Pulse Center (WP-D4 2/2).
 *
 * Extraídas de server.ts (composition root) sin cambiar comportamiento:
 * - GET /api/health/pulse → datos agregados de salud del dashboard
 */
import type { FastifyInstance } from 'fastify';
import { getDashboardData } from '@ninja/pulse-center';
import { sanitizeError } from '../sanitize-error.js';

export interface PulseRouteDeps {
  /** NODE_ENV validado por parseEnv (ADR-0004) — controla la verbosidad de sanitizeError. */
  nodeEnv: 'development' | 'production' | 'test';
}

export function registerPulseRoutes(server: FastifyInstance, deps: PulseRouteDeps): void {
  const { nodeEnv } = deps;

  server.get('/api/health/pulse', async (_request, reply) => {
    try {
      const data = getDashboardData();
      return reply.send(data);
    } catch (err) {
      return reply.status(500).send(sanitizeError(err, nodeEnv));
    }
  });
}
