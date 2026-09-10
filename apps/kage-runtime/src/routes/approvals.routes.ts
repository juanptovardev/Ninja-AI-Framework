/**
 * apps/kage-runtime — routes/approvals.routes.ts
 * Rutas de Sentinel + Trace Ledger (WP-D4 1/2): aprobaciones, auditoría y commits.
 *
 * Extraídas de server.ts (composition root) sin cambiar comportamiento:
 * - GET  /api/approvals              → aprobaciones pendientes
 * - POST /api/approvals/:id/approve  → aprobar (Ley 6: identidad del approver)
 * - POST /api/approvals/:id/reject   → rechazar (requiere reason)
 * - GET  /api/audit                  → log de auditoría
 * - GET  /api/commits                → commits de agentes (RF-16)
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import type { ApprovalManager, ApproverIdentity, Auditor } from '@ninja/sentinel';
import type { AgentCommitRepository } from '@ninja/trace-ledger';

export interface ApprovalsRouteDeps {
  approvalManager: ApprovalManager;
  auditor: Auditor;
  agentCommitRepo: AgentCommitRepository;
}

/**
 * Identidad real del approver derivada de la key autenticada (Ley 6 — doble
 * aprobación trazable). Antes se hardcodeaba `api-user/admin`, lo que hacía
 * imposible saber quién aprobó y permitía que cualquier key aprobara como
 * "admin" anónimo.
 */
function deriveApprover(request: FastifyRequest): ApproverIdentity {
  const raw = request.headers['x-ninja-key'];
  const key = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
  const fingerprint = createHash('sha256').update(key).digest('hex').slice(0, 12);
  return { id: `operator-${fingerprint}`, role: 'operator' };
}

export function registerApprovalsRoutes(server: FastifyInstance, deps: ApprovalsRouteDeps): void {
  const { approvalManager, auditor, agentCommitRepo } = deps;

  server.get('/api/approvals', async (_request, reply) => {
    const list = approvalManager.listPendingApprovals();
    return reply.send(list);
  });

  server.post<{ Params: { id: string } }>('/api/approvals/:id/approve', async (request, reply) => {
    const { id } = request.params;
    const body = (request.body as { notes?: string }) || {};
    const approver = deriveApprover(request);
    await approvalManager.approveRequest(id, approver, body.notes);
    return reply.send({ success: true });
  });

  server.post<{ Params: { id: string } }>('/api/approvals/:id/reject', async (request, reply) => {
    const { id } = request.params;
    const body = request.body as { reason: string };
    if (!body?.reason) return reply.status(400).send({ error: 'reason is required' });
    const approver = deriveApprover(request);
    await approvalManager.rejectRequest(id, approver, body.reason);
    return reply.send({ success: true });
  });

  server.get('/api/audit', async (_request, reply) => {
    const logs = auditor.getAuditLog();
    return reply.send(logs);
  });

  server.get<{ Querystring: { runId?: string; limit?: string } }>(
    '/api/commits',
    async (request, reply) => {
      const { runId, limit } = request.query;
      const lim = limit ? parseInt(limit) : 100;
      if (runId) {
        return reply.send(agentCommitRepo.findByRunId(runId));
      }
      return reply.send(agentCommitRepo.findAll(lim));
    }
  );
}
