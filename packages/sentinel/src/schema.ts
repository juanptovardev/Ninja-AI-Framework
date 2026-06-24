import type { ID, Timestamp } from '@ninja/contracts';

/**
 * PolicyAction — qué puede hacer Sentinel ante una acción de agente
 */
export type PolicyAction = 'allow' | 'block' | 'require-approval';

/**
 * Error lanzado cuando una acción requiere aprobación pendiente
 * Se usa para suspender la ejecución hasta que el usuario responda
 */
export class ApprovalPendingError extends Error {
  constructor(
    public readonly approvalId: ID,
    public readonly runId: ID,
    public readonly agentId: ID,
    public readonly actionType: string
  ) {
    super(`Action ${actionType} requires approval (approvalId: ${approvalId})`);
    this.name = 'ApprovalPendingError';
  }
}

/**
 * Policy — regla individual de evaluación de Sentinel
 */
export interface Policy {
  /** Identificador único de la política */
  readonly id: ID;
  /** Nombre descriptivo de la política */
  readonly name: string;
  /** Descripción para documentación interna */
  readonly description: string;
  /** Tipo de acción que evalúa (ej: 'shell.execute', 'fs.write') */
  readonly actionType: string;
  /** Acción a tomar si se cumple la condición */
  readonly action: PolicyAction;
  /** Prioridad de evaluación (menor = más importante) */
  readonly priority: number;
  /** Condiciones adicionales de evaluación */
  readonly conditions?: Record<string, unknown>;
  /** Fecha de creación */
  readonly createdAt: Timestamp;
}

/**
 * Resultado de la evaluación de una política
 */
export interface PolicyDecision {
  /** Acción determinada por Sentinel */
  readonly action: PolicyAction;
  /** ID de la política que causó esta decisión (si aplica) */
  readonly policyId?: ID;
  /** Razón de la decisión para logging y auditoría */
  readonly reason: string;
  /** Metadatos adicionales */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Solicitud de aprobación al usuario cuando policy=require-approval
 */
export interface ApprovalRequest {
  /** ID único de la solicitud */
  readonly id: ID;
  /** ID de la ejecución asociada */
  readonly runId: ID;
  /** ID del agente que solicitó la acción */
  readonly agentId: ID;
  /** Tipo de acción que requiere aprobación */
  readonly actionType: string;
  /** Resumen amigable para el usuario */
  readonly actionSummary: string;
  /** Detalles técnicos para revisión */
  readonly technicalDetails: string;
  /** ID de la política que generó esta solicitud */
  readonly policyId: ID;
  /** Fecha y hora de la solicitud */
  readonly requestedAt: Timestamp;
  /** Estado actual de la solicitud */
  readonly status: 'pending' | 'approved' | 'rejected';
  /** Fecha y hora de respuesta (si aplica) */
  readonly respondedAt?: Timestamp;
  /** Notas del usuario que respondió */
  readonly responderNotes?: string;
  /** Identidad de quien aprobó o rechazó (si aplica) */
  readonly approvedBy?: string;
}

/**
 * Entrada de auditoría — log de toda decisión de Sentinel
 */
export interface AuditEntry {
  /** ID único del registro de auditoría */
  readonly id: ID;
  /** Fecha y hora del evento */
  readonly timestamp: Timestamp;
  /** ID de la ejecución asociada (si aplica) */
  readonly runId?: ID;
  /** ID del agente involucrado (si aplica) */
  readonly agentId?: ID;
  /** Tipo de acción evaluada */
  readonly actionType: string;
  /** Acción tomada por Sentinel */
  readonly action: PolicyAction;
  /** ID de la política que causó la decisión (si aplica) */
  readonly policyId?: ID;
  /** ID de la solicitud de aprobación (si aplica) */
  readonly approvalId?: ID;
  /** Resultado final de la evaluación */
  readonly result: 'allowed' | 'blocked' | 'approved' | 'rejected';
  /** Razón de la decisión */
  readonly reason: string;
  /** Metadatos adicionales */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Contexto de evaluación para políticas
 */
export interface EvaluationContext {
  /** ID del agente que intenta ejecutar la acción */
  readonly agentId: ID;
  /** ID de la ejecución actual */
  readonly runId?: ID;
  /** ID de la sesión actual */
  readonly sessionId?: ID;
  /** Rol del agente */
  readonly agentRole?: string;
  /** Detalles específicos de la acción */
  readonly actionDetails: Record<string, unknown>;
  /** Permisos actuales del agente */
  readonly permissions?: Set<string>;
}

/**
 * Payload para evento sentinel.action.blocked
 * Emitido cuando una política de Sentinel bloquea una acción de agente
 */
export interface SentinelBlockedPayload {
  /** ID del agente cuya acción fue bloqueada */
  readonly agentId: ID;
  /** ID de la ejecución asociada */
  readonly runId: ID;
  /** Tipo de acción que fue bloqueada */
  readonly actionType: string;
  /** Razón del bloqueo */
  readonly reason: string;
  /** ID de la política que causó el bloqueo */
  readonly policyId: ID;
}
