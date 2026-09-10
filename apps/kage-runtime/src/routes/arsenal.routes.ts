/**
 * apps/kage-runtime — routes/arsenal.routes.ts
 * Rutas de Arsenal Registry + Artifacts + Vault (WP-D4 1/2).
 *
 * Extraídas de server.ts (composition root) sin cambiar comportamiento:
 * - GET  /api/arsenal             → tools + skills del Arsenal Registry (S3.4)
 * - GET  /api/artifacts           → lista de artefactos (filtros runId/type/isAnchor, WP-B8)
 * - GET  /api/artifacts/:id       → artefacto por id (404 si no existe)
 * - POST /api/vault/write         → escritura a memoria (VaultWriteSchema, 4 capas)
 */
import type { FastifyInstance } from 'fastify';
import type { ArsenalRegistry } from '@ninja/arsenal-registry';
import type { Artifact, ArtifactRepository } from '@ninja/trace-ledger';
import type { VaultCoordinator } from '@ninja/vault';
import { VaultWriteSchema } from '../route-schemas.js';

export interface ArsenalRouteDeps {
  arsenalRegistry: ArsenalRegistry;
  artifactRepo: ArtifactRepository;
  vaultCoordinator: VaultCoordinator;
}

export function registerArsenalRoutes(server: FastifyInstance, deps: ArsenalRouteDeps): void {
  const { arsenalRegistry, artifactRepo, vaultCoordinator } = deps;

  // GET /api/arsenal — inventario de tools y skills nativas (S3.4)
  server.get('/api/arsenal', async (_request, reply) => {
    return reply.send({
      tools: arsenalRegistry.listTools(),
      skills: arsenalRegistry.listSkills(),
    });
  });

  // GET /api/artifacts — lista filtrable de artefactos persistidos
  server.get<{ Querystring: { runId?: string; type?: string; isAnchor?: string } }>(
    '/api/artifacts',
    async (request, reply) => {
      const { runId, type, isAnchor } = request.query;
      let list = artifactRepo.findAll();

      if (runId) {
        list = list.filter((a: Artifact) => a.runId === runId);
      }
      if (type) {
        list = list.filter((a: Artifact) => a.type === type);
      }
      if (isAnchor === 'true') {
        // WP-B8: los anchors se persisten con type 'anchor' (la tabla artifacts no tiene columna isAnchor)
        list = list.filter((a: Artifact) => a.type === 'anchor');
      }

      return reply.send(list);
    }
  );

  // GET /api/artifacts/:id — artefacto individual
  server.get<{ Params: { id: string } }>('/api/artifacts/:id', async (request, reply) => {
    const { id } = request.params;
    const artifact = artifactRepo.findById(id);
    if (!artifact) {
      return reply.status(404).send({ error: 'Artifact not found' });
    }
    return reply.send(artifact);
  });

  // POST /api/vault/write — escritura a memoria (HOT/WARM/COLD/ANCHORS)
  server.post('/api/vault/write', async (request, reply) => {
    const parsed = VaultWriteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        issues: parsed.error.issues,
      });
    }
    const { agentId, sessionId, content, layer } = parsed.data;
    await vaultCoordinator.write(agentId ?? 'guest', sessionId, content, layer);
    return reply.send({ success: true });
  });
}
