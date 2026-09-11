/**
 * apps/kage-runtime — routes/forge-lab.routes.ts
 * Rutas del Forge Lab (WP-D4 2/2).
 *
 * Extraídas de server.ts (composition root) sin cambiar comportamiento:
 * - POST /api/forgelab/analyze → analizar repo de GitHub + pipeline de normalización/promoción
 * - GET  /api/forgelab/results → stub de resultados (TraceLedger/Storage en el futuro)
 */
import type { FastifyInstance } from 'fastify';
import { eventBus } from '@ninja/events';
import type { ArtifactRepository } from '@ninja/trace-ledger';
import { createLogger } from '@ninja/logging';
import { httpRequest } from '@ninja/integrations-http';
import {
  RepoAnalyzer,
  ContentExtractor,
  normalizeContent,
  scoreContent,
  LabPromoter,
} from '@ninja/forge-lab';
import { sanitizeError } from '../sanitize-error.js';

const log = createLogger('kage-runtime:routes:forge-lab');

export interface ForgeLabRouteDeps {
  artifactRepo: ArtifactRepository;
  /** NODE_ENV validado por parseEnv (ADR-0004) — controla la verbosidad de sanitizeError. */
  nodeEnv: 'development' | 'production' | 'test';
}

export function registerForgeLabRoutes(server: FastifyInstance, deps: ForgeLabRouteDeps): void {
  const { artifactRepo, nodeEnv } = deps;

  server.post('/api/forgelab/analyze', async (request, reply) => {
    const { url } = request.body as { url: string };
    if (!url) return reply.status(400).send({ error: 'GitHub URL is required' });

    try {
      const analyzer = new RepoAnalyzer(httpRequest);
      const analysis = await analyzer.analyzeGitHubRepo(url);

      const extractor = new ContentExtractor(httpRequest);
      const extracted = await extractor.extractRelevantFiles(analysis, {
        targetTypes: ['skill', 'pattern'],
      });

      const pipelineResults = await Promise.all(
        extracted.map(async (e) => {
          const norm = normalizeContent(e);
          const score = scoreContent(norm);
          // Use LabPromoter for database persistence
          const labPromoter = new LabPromoter(artifactRepo, crypto.randomUUID(), eventBus, log);
          const promo = await labPromoter.promoteContent(norm, score);
          return { file: e.sourcePath, score, promoted: promo.promoted };
        })
      );

      return reply.send({ analysis, pipelineResults });
    } catch (err) {
      return reply.status(500).send(sanitizeError(err, nodeEnv));
    }
  });

  server.get('/api/forgelab/results', async (_request, reply) => {
    // Temporary stub, would realistically query TraceLedger/Storage
    return reply.send({ runs: [] });
  });
}
