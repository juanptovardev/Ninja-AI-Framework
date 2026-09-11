/**
 * apps/kage-runtime — routes/status.routes.ts
 * Rutas de estado del runtime (WP-D4 2/2).
 *
 * Extraídas de server.ts (composition root) sin cambiar comportamiento:
 * - GET /api/status → RuntimeStatus (público)
 * - GET /status     → alias de compatibilidad hacia atrás
 */
import type { FastifyInstance } from 'fastify';
import type { RuntimeStatus } from '@ninja/contracts';
import { createLogger } from '@ninja/logging';
import { RUNTIME_VERSION } from '../constants.js';

const log = createLogger('kage-runtime:routes:status');

export function registerStatusRoutes(server: FastifyInstance): void {
  server.get('/api/status', async (_request, _reply): Promise<RuntimeStatus> => {
    log.debug('Status check requested');
    return {
      status: 'running',
      version: RUNTIME_VERSION,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });

  // Alias para compatibilidad hacia atrás
  server.get('/status', async (_request, _reply): Promise<RuntimeStatus> => {
    return {
      status: 'running',
      version: RUNTIME_VERSION,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });
}
