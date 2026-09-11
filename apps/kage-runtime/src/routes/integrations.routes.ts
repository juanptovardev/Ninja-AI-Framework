/**
 * apps/kage-runtime — routes/integrations.routes.ts
 * Rutas de integraciones externas: shell, git y fs (WP-D4 2/2).
 *
 * Extraídas de server.ts (composition root) sin cambiar comportamiento:
 * - POST /api/shell/execute → ejecución de comando (rate limit route-level 10/min)
 * - GET  /api/git/status    → git status --porcelain -b
 * - GET  /api/git/log       → git log --oneline
 * - POST /api/git/commit    → commit con aprobación de Sentinel (policy git.commit.policy)
 * - GET  /api/fs/scan       → escaneo de directorio
 */
import type { FastifyInstance } from 'fastify';
import type { ApprovalManager } from '@ninja/sentinel';
import { createLogger } from '@ninja/logging';
import { executeCommand, validateCommand, type ShellCommand } from '@ninja/integrations-shell';
import { GitClient, commit } from '@ninja/integrations-git';
import { scanDirectory } from '@ninja/integrations-fs';
import { ShellExecuteSchema, GitCommitSchema } from '../route-schemas.js';
import { sanitizeError } from '../sanitize-error.js';

const log = createLogger('kage-runtime:routes:integrations');

export interface IntegrationsRouteDeps {
  approvalManager: ApprovalManager;
  /** NODE_ENV validado por parseEnv (ADR-0004) — controla la verbosidad de sanitizeError. */
  nodeEnv: 'development' | 'production' | 'test';
}

export function registerIntegrationsRoutes(
  server: FastifyInstance,
  deps: IntegrationsRouteDeps
): void {
  const { approvalManager, nodeEnv } = deps;

  // Integrations-Shell Routes (rate limit estricto: 10/min — WP-C4c / F2.6)
  server.post(
    '/api/shell/execute',
    {
      config: {
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const parsed = ShellExecuteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid request body',
          code: 'VALIDATION_ERROR',
          issues: parsed.error.issues,
        });
      }
      const { cmd, args, cwd } = parsed.data;
      const shellCommand: ShellCommand = { cmd, args, cwd };
      const validation = validateCommand(shellCommand);
      if (!validation.allowed) {
        return reply.status(403).send({ error: validation.reason });
      }
      const result = await executeCommand(shellCommand);
      return reply.send(result);
    }
  );

  // Integrations-Git Routes
  server.get('/api/git/status', async (request, reply) => {
    const { repoPath } = request.query as { repoPath?: string };
    const git = new GitClient(repoPath || process.cwd());
    try {
      if (!(await git.isGitRepo())) {
        return reply.status(400).send({ error: 'Not a git repository' });
      }
      const result = await git.run(['status', '--porcelain', '-b']);
      return reply.send({ rawStatus: result.stdout });
    } catch (err) {
      return reply.status(500).send(sanitizeError(err, nodeEnv));
    }
  });

  server.get('/api/git/log', async (request, reply) => {
    const { repoPath, limit } = request.query as { repoPath?: string; limit?: string };
    const git = new GitClient(repoPath || process.cwd());
    const result = await git.run(['log', `-n`, limit || '20', '--oneline']);
    return reply.send({ rawLog: result.stdout });
  });

  server.post('/api/git/commit', async (request, reply) => {
    const parsed = GitCommitSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        issues: parsed.error.issues,
      });
    }
    const { message, repoPath } = parsed.data;
    try {
      const approvalResult = await approvalManager.createApprovalRequest({
        runId: crypto.randomUUID(),
        agentId: 'kage-runtime',
        actionType: 'git.commit',
        actionSummary: `Git commit: "${message}"`,
        technicalDetails: JSON.stringify({ repoPath, message }),
        policyId: 'git.commit.policy',
      });
      if (!approvalResult.approved) {
        return reply
          .status(403)
          .send({ error: 'Commit rejected by Sentinel policy', notes: approvalResult.notes });
      }
      const git = new GitClient(repoPath || process.cwd());
      await commit(git, message);
      return reply.send({
        success: true,
        message: 'Commit created successfully',
        repoPath: repoPath || process.cwd(),
      });
    } catch (err) {
      return reply.status(500).send(sanitizeError(err, nodeEnv));
    }
  });

  // Integrations-FS Routes
  server.get('/api/fs/scan', async (request, reply) => {
    const { dirPath } = request.query as { dirPath?: string };
    const results = await scanDirectory(dirPath || process.cwd());
    return reply.send(results);
  });

  log.info('Registered integrations routes (/api/shell, /api/git, /api/fs)');
}
