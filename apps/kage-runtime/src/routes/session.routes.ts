/**
 * apps/kage-runtime — routes/session.routes.ts
 * Rutas de Sesiones (WP-D4 2/2).
 *
 * Extraídas de server.ts (composition root) sin cambiar comportamiento:
 * - POST /api/session/init        → crear sesión + observación en Engram
 * - GET  /api/session/list        → historial de sesiones (findAll no existe en
 *                                    SessionRepository → guard dead → envía [])
 * - POST /api/session/restore/:id → restaurar sesión + observación en Engram
 */
import type { FastifyInstance } from 'fastify';
import type { SessionRepository, Session } from '@ninja/trace-ledger';
import { engramClient } from '@ninja/integrations-engram';
import { createLogger } from '@ninja/logging';
import { sanitizeError } from '../sanitize-error.js';

const log = createLogger('kage-runtime:routes:session');

/**
 * Repo de sesiones con el método opcional que el handler original verificaba en
 * runtime (`typeof findAll === 'function'`). Tipado estructural para preservar
 * el guard exacto: si la clase nunca lo implementa, la lista queda vacía.
 */
type SessionRepositoryWithList = SessionRepository & { findAll?(): Session[] };

export interface SessionRouteDeps {
  sessionRepo: SessionRepositoryWithList;
  /** NODE_ENV validado por parseEnv (ADR-0004) — controla la verbosidad de sanitizeError. */
  nodeEnv: 'development' | 'production' | 'test';
}

export function registerSessionRoutes(server: FastifyInstance, deps: SessionRouteDeps): void {
  const { sessionRepo, nodeEnv } = deps;

  server.post('/api/session/init', async (request, reply) => {
    try {
      const workspaceId = 'default-workspace';
      const session = sessionRepo.create({
        workspaceId,
        startedAt: new Date().toISOString(),
      });

      await engramClient.recordObservation(
        'session.init',
        `Initialized blank session ${session.id} for workspace ${workspaceId}`
      );

      return reply.send({ sessionId: session.id, status: 'initialized' });
    } catch (err: unknown) {
      log.error('Failed to init session', err);
      return reply.status(500).send(sanitizeError(err, nodeEnv));
    }
  });

  server.get('/api/session/list', async (_request, reply) => {
    const sessions = sessionRepo.findAll?.() ?? [];
    return reply.send(sessions);
  });

  server.post<{ Params: { id: string } }>('/api/session/restore/:id', async (request, reply) => {
    const id = request.params.id;
    try {
      const session = sessionRepo.findById(id);
      if (!session) {
        return reply.status(404).send({ error: 'Session not found' });
      }

      await engramClient.recordObservation('session.restore', `Restored session ${id}`);
      return reply.send({ sessionId: id, status: 'restored' });
    } catch (err: unknown) {
      log.error('Failed to restore session', err);
      return reply.status(500).send(sanitizeError(err, nodeEnv));
    }
  });
}
