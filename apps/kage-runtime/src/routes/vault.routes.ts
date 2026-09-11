/**
 * apps/kage-runtime — routes/vault.routes.ts
 * Rutas del Vault de memoria (WP-D4 2/2).
 *
 * Extraídas de server.ts (composition root) sin cambiar comportamiento:
 * - GET /api/vault/context → query multi-capa (HOT/WARM/COLD) del Vault
 */
import type { FastifyInstance } from 'fastify';
import type { MemoryLayer, VaultCoordinator } from '@ninja/vault';

export interface VaultRouteDeps {
  vaultCoordinator: VaultCoordinator;
}

interface VaultContextQuery {
  q: string;
  sessionId: string;
  agentId?: string;
  layers?: string;
  budget?: string;
}

export function registerVaultRoutes(server: FastifyInstance, deps: VaultRouteDeps): void {
  const { vaultCoordinator } = deps;

  server.get<{ Querystring: VaultContextQuery }>('/api/vault/context', async (request, reply) => {
    const { q, sessionId, agentId, layers, budget } = request.query;
    if (!q || !sessionId) {
      return reply.status(400).send({ error: 'Query (q) and sessionId are required' });
    }

    const results = await vaultCoordinator.query({
      agentId: agentId ?? 'guest',
      sessionId,
      query: q,
      // Zod del query string: layers llega como CSV string → se acota a MemoryLayer[].
      layers: layers ? (layers.split(',') as MemoryLayer[]) : ['HOT', 'WARM', 'COLD'],
      tokenBudget: budget ? parseInt(budget) : 2000,
    });
    return reply.send(results);
  });
}
