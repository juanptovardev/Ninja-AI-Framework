import type { Logger } from '@ninja/logging';
import type { EventBus } from '@ninja/events';
import type { NinjaEvent } from '@ninja/contracts';
import type { ID, Timestamp } from '@ninja/contracts';
import { SentinelError, ErrorCodes } from '@ninja/contracts';
import type { ApprovalRequest } from './schema';

/**
 * Identidad del agente o humano que aprueba/rechaza una solicitud
 */
export interface ApproverIdentity {
  /** Identificador único del approver (user ID, agent ID, etc.) */
  readonly id: string;
  /** Rol del approver (ej: 'admin', 'operator', 'senior-agent') */
  readonly role: string;
}

/**
 * Resultado de una aprobación (respuesta del usuario)
 */
export interface ApprovalResult {
  /** Si fue aprobada o rechazada */
  readonly approved: boolean;
  /** Timestamp de la respuesta */
  readonly respondedAt: Timestamp;
  /** Notas adicionales del usuario */
  readonly notes?: string;
  /** Identidad de quien aprobó o rechazó (formato "id::role") */
  readonly approvedBy: string;
}

/**
 * Opciones para crear una solicitud de aprobación
 */
export interface CreateApprovalOptions {
  /** ID de la ejecución asociada */
  readonly runId: ID;
  /** ID del agente que solicitó la acción */
  readonly agentId: ID;
  /** Tipo de acción que requiere aprobación */
  readonly actionType: string;
  /** Resumen amigable para el usuario (doble confirmación - parte 2) */
  readonly actionSummary: string;
  /** Detalles técnicos para revisión (doble confirmación - parte 1) */
  readonly technicalDetails: string;
  /** ID de la política que generó esta solicitud */
  readonly policyId: ID;
  /** Timeout personalizado en milisegundos (opcional) */
  readonly timeoutMs?: number;
}

/**
 * Entrada interna para manejar promesas pendientes
 */
interface PendingResponse {
  resolve: (result: ApprovalResult) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
}

/**
 * Payload para el evento sentinel.approval.requested
 */
export interface ApprovalRequestedPayload {
  readonly approvalId: ID;
  readonly runId: ID;
  readonly agentId: ID;
  readonly actionType: string;
  readonly actionSummary: string;
  readonly technicalDetails: string;
  readonly policyId: ID;
  readonly requestedAt: Timestamp;
}

/**
 * Payload para el evento sentinel.approval.received
 */
export interface ApprovalReceivedPayload {
  readonly approvalId: ID;
  readonly runId: ID;
  readonly approved: boolean;
  readonly notes?: string;
  readonly respondedAt: Timestamp;
  readonly approvedBy: string;
}

/**
 * Payload para el evento sentinel.approval.cancelled
 */
export interface ApprovalCancelledPayload {
  readonly approvalId: ID;
  readonly runId: ID;
  readonly cancelledAt: Timestamp;
  readonly reason?: string;
}

/**
 * Manager de solicitudes de aprobación — Sistema de Doble Confirmación
 *
 * Maneja el ciclo de vida completo de las aprobaciones pendientes,
 * incluyendo timeout handling, emisión de eventos y cleanup.
 *
 * Seguridad: toda aprobación/rechazo requiere identidad verificable
 * (ApproverIdentity) con rol autorizado y prohibición de auto-aprobación.
 */
export class ApprovalManager {
  /** Aprobaciones pendientes y completadas */
  private readonly approvals: Map<ID, ApprovalRequest> = new Map();

  /** Promesas pendientes de respuesta */
  private readonly pendingResponses: Map<ID, PendingResponse> = new Map();

  /** Timeout por defecto: 5 minutos */
  private readonly defaultTimeoutMs: number;

  /** Roles autorizados para aprobar/rechazar solicitudes */
  private readonly authorizedRoles: Set<string>;

  /**
   * Constructor del ApprovalManager
   * @param authorizedRoles - Roles permitidos para aprobar/rechazar (default: admin, operator, senior-agent)
   */
  constructor(
    private readonly eventBus: EventBus,
    private readonly logger: Logger,
    defaultTimeoutMs: number = 300000,
    authorizedRoles: string[] = ['admin', 'operator', 'senior-agent']
  ) {
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.authorizedRoles = new Set(authorizedRoles);
    this.logger.info('ApprovalManager initialized', { defaultTimeoutMs, authorizedRoles });
  }

  /**
   * Crea una nueva solicitud de aprobación
   *
   * Implementa el sistema de doble confirmación:
   * - Parte 1: technicalDetails (resumen técnico estructurado)
   * - Parte 2: actionSummary (resumen amigable/ejecutivo)
   */
  async createApprovalRequest(options: CreateApprovalOptions): Promise<ApprovalResult> {
    const approvalId = crypto.randomUUID() as ID;
    const requestedAt = new Date().toISOString();

    this.logger.info('Creating approval request', {
      approvalId,
      actionType: options.actionType,
      agentId: options.agentId,
    });

    const approval: ApprovalRequest = {
      id: approvalId,
      runId: options.runId,
      agentId: options.agentId,
      actionType: options.actionType,
      actionSummary: options.actionSummary,
      technicalDetails: options.technicalDetails,
      policyId: options.policyId,
      requestedAt,
      status: 'pending',
    };

    this.approvals.set(approvalId, approval);

    this.eventBus.emit({
      id: crypto.randomUUID(),
      type: 'sentinel.approval.requested',
      source: 'sentinel',
      timestamp: requestedAt,
      payload: {
        approvalId,
        runId: options.runId,
        agentId: options.agentId,
        actionType: options.actionType,
        actionSummary: options.actionSummary,
        technicalDetails: options.technicalDetails,
        policyId: options.policyId,
        requestedAt,
      } as ApprovalRequestedPayload,
    });

    return new Promise<ApprovalResult>((resolve, reject) => {
      const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;

      const timeoutId = setTimeout(() => {
        this.pendingResponses.delete(approvalId);
        const timeoutError = new Error(`Approval ${approvalId} timed out after ${timeoutMs}ms`);
        reject(timeoutError);
        this.handleTimeout(approvalId, timeoutMs);
      }, timeoutMs);

      this.pendingResponses.set(approvalId, { resolve, reject, timeoutId });
    });
  }

  /**
   * Aprueba una solicitud de aprobación pendiente
   * @throws {Error} Si el approver no está autorizado, intenta auto-aprobarse, o la solicitud no existe/no está pendiente
   */
  async approveRequest(approvalId: ID, approver: ApproverIdentity, notes?: string): Promise<void> {
    const approval = this.validateAndGetApproval(approvalId);
    this.validateApprover(approver, approval.agentId);

    const approvedBy = `${approver.id}::${approver.role}`;
    this.logger.info('Approving request', { approvalId, approvedBy, notes });

    const respondedAt = new Date().toISOString();

    const updatedApproval: ApprovalRequest = {
      ...approval,
      status: 'approved',
      respondedAt,
      responderNotes: notes,
      approvedBy,
    };

    this.approvals.set(approvalId, updatedApproval);

    const pending = this.pendingResponses.get(approvalId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingResponses.delete(approvalId);
      pending.resolve({ approved: true, respondedAt, notes, approvedBy });
    }

    this.eventBus.emit({
      id: crypto.randomUUID(),
      type: 'sentinel.approval.received',
      source: 'sentinel',
      timestamp: respondedAt,
      payload: {
        approvalId,
        runId: approval.runId,
        approved: true,
        notes,
        respondedAt,
        approvedBy,
      } as ApprovalReceivedPayload,
    });
  }

  /**
   * Rechaza una solicitud de aprobación pendiente
   * @throws {Error} Si el approver no está autorizado, intenta auto-rechazarse, o la solicitud no existe/no está pendiente
   */
  async rejectRequest(approvalId: ID, approver: ApproverIdentity, reason: string): Promise<void> {
    const approval = this.validateAndGetApproval(approvalId);
    this.validateApprover(approver, approval.agentId);

    const approvedBy = `${approver.id}::${approver.role}`;
    this.logger.info('Rejecting request', { approvalId, approvedBy, reason });

    const respondedAt = new Date().toISOString();

    const updatedApproval: ApprovalRequest = {
      ...approval,
      status: 'rejected',
      respondedAt,
      responderNotes: reason,
      approvedBy,
    };

    this.approvals.set(approvalId, updatedApproval);

    const pending = this.pendingResponses.get(approvalId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingResponses.delete(approvalId);
      pending.resolve({ approved: false, respondedAt, notes: reason, approvedBy });
    }

    this.eventBus.emit({
      id: crypto.randomUUID(),
      type: 'sentinel.approval.received',
      source: 'sentinel',
      timestamp: respondedAt,
      payload: {
        approvalId,
        runId: approval.runId,
        approved: false,
        notes: reason,
        respondedAt,
        approvedBy,
      } as ApprovalReceivedPayload,
    });
  }

  /**
   * Cancela una solicitud de aprobación
   */
  async cancelRequest(approvalId: ID, reason?: string): Promise<void> {
    const approval = this.approvals.get(approvalId);
    if (!approval) {
      this.logger.warn('Attempted to cancel non-existent approval', { approvalId });
      return;
    }

    this.logger.info('Cancelling approval', { approvalId, reason });

    const cancelledAt = new Date().toISOString();

    const pending = this.pendingResponses.get(approvalId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      pending.reject(
        new Error(`Approval ${approvalId} was cancelled: ${reason ?? 'No reason provided'}`)
      );
      this.pendingResponses.delete(approvalId);
    }

    this.approvals.delete(approvalId);

    this.eventBus.emit({
      id: crypto.randomUUID(),
      type: 'sentinel.approval.cancelled',
      source: 'sentinel',
      timestamp: cancelledAt,
      payload: {
        approvalId,
        runId: approval.runId,
        cancelledAt,
        reason,
      } as ApprovalCancelledPayload,
    });
  }

  /**
   * Obtiene una aprobación pendiente por ID
   */
  getPendingApproval(approvalId: ID): ApprovalRequest | null {
    const approval = this.approvals.get(approvalId);
    if (approval && approval.status === 'pending') {
      return approval;
    }
    return null;
  }

  /**
   * Lista todas las aprobaciones pendientes
   */
  listPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.approvals.values()).filter((approval) => approval.status === 'pending');
  }

  /**
   * Lista aprobaciones pendientes por agente
   */
  listPendingApprovalsByAgent(agentId: ID): ApprovalRequest[] {
    return this.listPendingApprovals().filter((approval) => approval.agentId === agentId);
  }

  /**
   * Lista aprobaciones pendientes por run
   */
  listPendingApprovalsByRun(runId: ID): ApprovalRequest[] {
    return this.listPendingApprovals().filter((approval) => approval.runId === runId);
  }

  /**
   * Verifica si una aprobación ha expirado
   */
  isApprovalExpired(approval: ApprovalRequest): boolean {
    const now = new Date().getTime();
    const requestedTime = new Date(approval.requestedAt).getTime();
    return now - requestedTime > this.defaultTimeoutMs;
  }

  /**
   * Limpia aprobaciones expiradas
   */
  async cleanupExpiredApprovals(): Promise<number> {
    const now = new Date().getTime();
    const expiredIds: ID[] = [];

    for (const [id, approval] of this.approvals.entries()) {
      if (approval.status === 'pending' && this.isApprovalExpired(approval)) {
        expiredIds.push(id);
      }
    }

    for (const id of expiredIds) {
      await this.cancelRequest(id, 'Approval expired by timeout');
    }

    if (expiredIds.length > 0) {
      this.logger.info(`Cleaned up ${expiredIds.length} expired approvals`);
    }

    return expiredIds.length;
  }

  /**
   * Obtiene el número total de aprobaciones (pendientes y completadas)
   */
  getApprovalCount(): number {
    return this.approvals.size;
  }

  /**
   * Obtiene el número de aprobaciones pendientes
   */
  getPendingCount(): number {
    return this.listPendingApprovals().length;
  }

  /**
   * Valida que el approver tenga permisos para responder la solicitud
   * - Identidad no vacía
   * - Rol autorizado
   * - No puede auto-aprobarse (approver.id !== agentId)
   */
  private validateApprover(approver: ApproverIdentity, agentId?: ID): void {
    if (!approver.id || approver.id.trim() === '') {
      throw new SentinelError(ErrorCodes.APPROVAL_DENIED, 'Approver identity id is required', {
        httpStatus: 400,
      });
    }

    if (!approver.role || approver.role.trim() === '') {
      throw new SentinelError(ErrorCodes.APPROVAL_DENIED, 'Approver identity role is required', {
        httpStatus: 400,
      });
    }

    if (!this.authorizedRoles.has(approver.role)) {
      throw new SentinelError(
        ErrorCodes.APPROVAL_DENIED,
        `Approver role "${approver.role}" is not authorized. Authorized roles: ${Array.from(this.authorizedRoles).join(', ')}`,
        { httpStatus: 403, context: { role: approver.role } },
      );
    }

    if (approver.id === agentId) {
      throw new SentinelError(
        ErrorCodes.APPROVAL_DENIED,
        `Approver "${approver.id}" cannot approve their own request (agentId: ${agentId})`,
        { httpStatus: 403, context: { approverId: approver.id, agentId } },
      );
    }
  }

  /**
   * Valida y obtiene una aprobación, lanzando error si no existe o no está pendiente
   */
  private validateAndGetApproval(approvalId: ID): ApprovalRequest {
    const approval = this.approvals.get(approvalId);

    if (!approval) {
      throw new SentinelError(
        ErrorCodes.APPROVAL_NOT_FOUND,
        `Approval ${approvalId} not found`,
        { httpStatus: 404, context: { approvalId } },
      );
    }

    if (approval.status !== 'pending') {
      throw new SentinelError(
        ErrorCodes.APPROVAL_DENIED,
        `Approval ${approvalId} is not pending (current status: ${approval.status})`,
        { httpStatus: 409, context: { approvalId, status: approval.status } },
      );
    }

    return approval;
  }

  /**
   * Maneja el timeout de una aprobación
   */
  private async handleTimeout(approvalId: ID, timeoutMs: number): Promise<void> {
    const approval = this.approvals.get(approvalId);

    if (approval && approval.status === 'pending') {
      this.logger.warn('Approval expired by timeout', { approvalId, timeoutMs });
      await this.cancelRequest(approvalId, `Approval expired after ${timeoutMs}ms`);
    }
  }
}
