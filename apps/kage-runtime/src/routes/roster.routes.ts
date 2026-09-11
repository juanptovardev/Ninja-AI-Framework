/**
 * apps/kage-runtime — routes/roster.routes.ts
 * Rutas de Roster & Failover (WP-D4 2/2).
 *
 * Extraídas de server.ts (composition root) sin cambiar comportamiento:
 * - GET  /api/roster            → roster actual (con fallback 'agent-' mocking)
 * - POST /api/roster/assign     → asignar rol a un cliente (RosterAssignSchema)
 */
import type { FastifyInstance } from 'fastify';
import type { ClientId, ClientRole, RosterManager } from '@ninja/roster';
import { createLogger } from '@ninja/logging';
import { RosterAssignSchema } from '../route-schemas.js';
import { sanitizeError } from '../sanitize-error.js';

const log = createLogger('kage-runtime:routes:roster');

export interface RosterRouteDeps {
  rosterManager: RosterManager;
  /** NODE_ENV validado por parseEnv (ADR-0004) — controla la verbosidad de sanitizeError. */
  nodeEnv: 'development' | 'production' | 'test';
}

export function registerRosterRoutes(server: FastifyInstance, deps: RosterRouteDeps): void {
  const { rosterManager, nodeEnv } = deps;

  server.get('/api/roster', async (_request, reply) => {
    return reply.send(rosterManager.getRoster());
  });

  server.post('/api/roster/assign', async (request, reply) => {
    const parsed = RosterAssignSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        issues: parsed.error.issues,
      });
    }
    const { clientId, role } = parsed.data;
    try {
      // Zod valida clientId/role como string/enum genérico; Roster los tipa como
      // literales (ClientId/ClientRole). El cast acota el string a la unión real.
      rosterManager.assignRole(clientId as ClientId, role as ClientRole);
      return reply.send({ success: true });
    } catch (err) {
      if (clientId.startsWith('agent-')) {
        log.info(`Mocking roster assignment for UI agent: ${clientId} to ${role}`);
        return reply.send({ success: true });
      }
      return reply.status(400).send(sanitizeError(err, nodeEnv));
    }
  });
}
