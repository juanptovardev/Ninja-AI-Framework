/**
 * apps/kage-runtime — routes/installer.routes.ts
 * Rutas del Installer (Gentle AI-compatible orchestration pipeline) (WP-D4 2/2).
 *
 * Extraídas de server.ts (composition root) sin cambiar comportamiento:
 * - POST   /api/install/:agentId          → instalar Ninja en un agente
 * - POST   /api/install/all               → instalar en todos los agentes detectados
 * - POST   /api/sync/:agentId             → sync de archivos Ninja a un agente
 * - DELETE /api/install/:agentId          → uninstall (restore opcional)
 * - GET    /api/install/:agentId/verify   → verificar config de un agente
 * - GET    /api/doctor                    → verificar todos los agentes
 * - GET    /api/roster/verify             → delegado a routes/roster-verify.ts
 */
import type { FastifyInstance } from 'fastify';
import type { ClientId } from '@ninja/roster';
import type { AgentInstaller } from '@ninja/installer';
import { createLogger } from '@ninja/logging';
import { registerRosterVerifyRoute } from './roster-verify.js';

const log = createLogger('kage-runtime:routes:installer');

export interface InstallerRouteDeps {
  agentInstaller: AgentInstaller;
}

export function registerInstallerRoutes(server: FastifyInstance, deps: InstallerRouteDeps): void {
  const { agentInstaller } = deps;

  // POST /api/install/:agentId — install Ninja into a specific agent
  server.post<{ Params: { agentId: string } }>('/api/install/:agentId', async (request, reply) => {
    const { agentId } = request.params;
    const result = await agentInstaller.install(agentId as ClientId, {
      backup: true,
      verify: true,
    });
    return reply.status(result.success ? 200 : 400).send(result);
  });

  // POST /api/install/all — install Ninja into all detected agents
  server.post('/api/install/all', async (_request, reply) => {
    const results = await agentInstaller.installAll({ backup: true, verify: true });
    return reply.send({
      total: results.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    });
  });

  // POST /api/sync/:agentId — sync Ninja files to a specific agent
  server.post<{ Params: { agentId: string } }>('/api/sync/:agentId', async (request, reply) => {
    const { agentId } = request.params;
    const result = await agentInstaller.sync(agentId as ClientId);
    return reply.send(result);
  });

  // DELETE /api/install/:agentId — uninstall Ninja from a specific agent
  server.delete<{ Params: { agentId: string }; Querystring: { restore?: string } }>(
    '/api/install/:agentId',
    async (request, reply) => {
      const { agentId } = request.params;
      const restoreBackup = request.query.restore === 'true';
      const result = await agentInstaller.uninstall(agentId as ClientId, restoreBackup);
      return reply.send(result);
    }
  );

  // GET /api/install/:agentId/verify — verify agent config
  server.get<{ Params: { agentId: string } }>(
    '/api/install/:agentId/verify',
    async (request, reply) => {
      const { agentId } = request.params;
      const report = await agentInstaller.verify(agentId as ClientId);
      return reply.send(report);
    }
  );

  // GET /api/doctor — verify all detected agents (Ninja doctor)
  server.get('/api/doctor', async (_request, reply) => {
    const { detectAllClients } = await import('@ninja/roster');
    const detected = detectAllClients();
    const reports = await Promise.all(
      Object.keys(detected).map((id) => agentInstaller.verify(id as ClientId))
    );
    return reply.send({
      total: reports.length,
      passed: reports.filter((r) => r.passed).length,
      failed: reports.filter((r) => !r.passed).length,
      reports,
    });
  });

  // GET /api/roster/verify — verify ALL known agents (including undetected)
  registerRosterVerifyRoute(server, { agentInstaller });

  log.info('Installer routes registered: /api/install, /api/sync, /api/doctor, /api/roster/verify');
}
