import type { EngineApproval, ApprovalResult } from './schema';
import type { EventBus } from '@ninja/events';
import type { Logger } from '@ninja/logging';

// Manejador de aprobaciones
export class ApprovalManager {
  private readonly approvals: Map<string, EngineApproval> = new Map();
  private readonly pendingResponses: Map<
    string,
    {
      resolve: (result: ApprovalResult) => void;
      reject: (error: Error) => void;
      timeoutId: NodeJS.Timeout;
    }
  > = new Map();

  constructor(
    private readonly eventBus: EventBus,
    private readonly logger: Logger,
    private readonly defaultTimeoutMs: number = 300000 // 5 minutos por defecto
  ) {}

  /**
   * Solicita una aprobación al usuario
   */
  async requestApproval(approval: EngineApproval): Promise<ApprovalResult> {
    this.logger.info(`Requesting approval: ${approval.id}`, {
      type: approval.type,
      runId: approval.runId,
    });

    // 1. Registrar la aprobación
    this.approvals.set(approval.id, approval);

    // 2. Emitir evento al bus para que la UI lo muestre
    this.eventBus.emit({
      id: crypto.randomUUID(),
      type: 'engine.approval.requested',
      source: 'kage-engine',
      timestamp: new Date().toISOString(),
      payload: {
        approvalId: approval.id,
        runId: approval.runId,
        type: approval.type,
        technicalSummary: approval.technicalSummary,
        friendlySummary: approval.friendlySummary,
        requestedAt: approval.requestedAt,
      },
    });

    // 3. Crear promesa que se resolverá cuando el usuario responda
    return new Promise<ApprovalResult>((resolve, reject) => {
      // 4. Configurar timeout
      const timeoutId = setTimeout(() => {
        this.pendingResponses.delete(approval.id);
        reject(new Error(`Approval ${approval.id} timed out after ${this.defaultTimeoutMs}ms`));
      }, this.defaultTimeoutMs);

      // 5. Registrar el manejador de respuesta pendiente
      this.pendingResponses.set(approval.id, { resolve, reject, timeoutId });
    });
  }

  /**
   * Procesa la respuesta de una aprobación
   */
  async processApprovalResponse(approvalId: string, result: ApprovalResult): Promise<void> {
    this.logger.info(`Processing approval response: ${approvalId}`, {
      approved: result.approved,
    });

    // 1. Verificar que la aprobación exista
    const approval = this.approvals.get(approvalId);
    if (!approval) {
      throw new Error(`Approval ${approvalId} not found`);
    }

    // 2. Limpiar timeout si existe
    const pending = this.pendingResponses.get(approvalId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingResponses.delete(approvalId);
    }

    // 3. Registrar respuesta en el sistema
    result.respondedAt = new Date().toISOString();

    // 4. Resolver la promesa pendiente
    if (pending) {
      pending.resolve(result);
    }

    // 5. Emitir evento de aprobación recibida
    this.eventBus.emit({
      id: crypto.randomUUID(),
      type: 'engine.approval.received',
      source: 'kage-engine',
      timestamp: result.respondedAt,
      payload: {
        approvalId,
        runId: approval.runId,
        approved: result.approved,
        notes: result.notes,
      },
    });

    // 6. Eliminar la aprobación completada
    this.approvals.delete(approvalId);
  }

  /**
   * Cancela una solicitud de aprobación
   */
  async cancelApproval(approvalId: string): Promise<void> {
    this.logger.info(`Cancelling approval: ${approvalId}`);

    // 1. Verificar que la aprobación exista
    const approval = this.approvals.get(approvalId);
    if (!approval) {
      throw new Error(`Approval ${approvalId} not found`);
    }

    // 2. Limpiar timeout y rechazar promesa pendiente
    const pending = this.pendingResponses.get(approvalId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(`Approval ${approvalId} was cancelled`));
      this.pendingResponses.delete(approvalId);
    }

    // 3. Eliminar la aprobación
    this.approvals.delete(approvalId);

    // 4. Emitir evento de cancelación
    this.eventBus.emit({
      id: crypto.randomUUID(),
      type: 'engine.approval.cancelled',
      source: 'kage-engine',
      timestamp: new Date().toISOString(),
      payload: {
        approvalId,
        runId: approval.runId,
      },
    });
  }

  /**
   * Obtiene una aprobación pendiente
   */
  getPendingApproval(approvalId: string): EngineApproval | null {
    return this.approvals.get(approvalId) || null;
  }

  /**
   * Lista todas las aprobaciones pendientes
   */
  listPendingApprovals(): EngineApproval[] {
    return Array.from(this.approvals.values());
  }

  /**
   * Verifica si una aprobación ha expirado
   */
  isApprovalExpired(approval: EngineApproval): boolean {
    const now = new Date().getTime();
    const requestedTime = new Date(approval.requestedAt).getTime();
    return now - requestedTime > this.defaultTimeoutMs;
  }

  /**
   * Limpia aprobaciones expiradas
   */
  async cleanupExpiredApprovals(): Promise<void> {
    const now = new Date().getTime();
    const expiredApprovals: string[] = [];

    for (const [id, approval] of this.approvals.entries()) {
      const requestedTime = new Date(approval.requestedAt).getTime();
      if (now - requestedTime > this.defaultTimeoutMs) {
        expiredApprovals.push(id);
      }
    }

    for (const id of expiredApprovals) {
      await this.cancelApproval(id);
    }

    if (expiredApprovals.length > 0) {
      this.logger.info(`Cleaned up ${expiredApprovals.length} expired approvals`);
    }
  }
}
