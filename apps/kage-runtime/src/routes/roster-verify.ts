import type { FastifyInstance } from 'fastify';
import { createLogger } from '@ninja/logging';
import { ALL_CLIENT_IDS, detectClient } from '@ninja/roster';
import type { ClientId, ClientConfig } from '@ninja/roster';
import type { VerifyReport } from '@ninja/installer';
import type { AgentInstaller } from '@ninja/installer';

const log = createLogger('kage-runtime:roster-verify');

export interface RosterVerifyResponse {
  passed: boolean;
  agents: Record<string, VerifyReport>;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

export function registerRosterVerifyRoute(
  server: FastifyInstance,
  deps: { agentInstaller: AgentInstaller }
): void {
  server.get('/api/roster/verify', async (_request, reply) => {
    try {
      const { agentInstaller } = deps;
      const agents: Record<string, VerifyReport> = {};
      let totalWarnings = 0;

      for (const id of ALL_CLIENT_IDS) {
        const config: ClientConfig | null = detectClient(id);

        if (!config) {
          agents[id] = {
            agentId: id,
            passed: false,
            present: [],
            missing: [],
            warnings: [`Agent ${id} is not detected on this system`],
          };
          continue;
        }

        try {
          const report: VerifyReport = await agentInstaller.verify(id as ClientId);
          agents[id] = report;
          totalWarnings += report.warnings.length;
        } catch (err: any) {
          agents[id] = {
            agentId: id,
            passed: false,
            present: [],
            missing: [],
            warnings: [`Verify failed for ${id}: ${err.message}`],
          };
        }
      }

      const reports = Object.values(agents);
      const passedCount = reports.filter(r => r.passed).length;
      const failedCount = reports.filter(r => !r.passed).length;
      const allPassed = failedCount === 0;

      const body: RosterVerifyResponse = {
        passed: allPassed,
        agents,
        summary: {
          total: ALL_CLIENT_IDS.length,
          passed: passedCount,
          failed: failedCount,
          warnings: totalWarnings,
        },
      };

      return reply.status(allPassed ? 200 : 207).send(body);
    } catch (err: any) {
      log.error('Failed to verify roster', err);
      return reply.status(500).send({ error: err.message });
    }
  });

  log.info('Registered GET /api/roster/verify');
}
