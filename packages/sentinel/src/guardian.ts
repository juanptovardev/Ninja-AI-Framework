import type { EventBus, NinjaEvent } from '@ninja/events';
import type { Logger } from '@ninja/logging';
import type { ID } from '@ninja/contracts';
import type { ApprovalManager } from './approval.js';
import type { PolicyEngine } from './policy.js';
import type { PolicyDecision, SentinelBlockedPayload } from './schema.js';
import { createEvent } from '@ninja/events';
import { ApprovalPendingError } from './schema.js';

export class Guardian {
  constructor(
    private readonly eventBus: EventBus,
    private readonly logger: Logger,
    private readonly approvalManager: ApprovalManager,
    private readonly policyEngine?: PolicyEngine
  ) {
    this.logger.info('Guardian initialized');
  }

  start(): void {
    // Escuchar problemas de salud emitidos por Pulse Center
    this.eventBus.on('health.degradation.detected', (event: NinjaEvent) => {
      const payload = event.payload as any;
      this.logger.warn('Guardian detected health degradation. Emitting intervention event.', payload);

      this.eventBus.emit({
        id: crypto.randomUUID() as ID,
        type: 'sentinel.intervention',
        source: 'sentinel',
        timestamp: new Date().toISOString(),
        payload: {
          reason: 'System health degraded: ' + (payload.providerId || 'unknown'),
          action: 'pause_affected_agents'
        }
      });
    });

    this.eventBus.on('health.context.inefficient', (event: NinjaEvent) => {
      const payload = event.payload as any;
      this.logger.warn('Guardian detected context inefficiency', payload);
    });
  }

  /**
   * Evalúa una acción de agente contra las políticas de Sentinel.
   * Si la decisión es 'block', emite sentinel.action.blocked.
   * Si la decisión es 'require-approval', crea una solicitud de aprobación y suspende la acción.
   * Si la decisión es 'allow', retorna true.
   * 
   * @returns Promise<boolean> - true si la acción está permitida, false si está bloqueada o pendiente de aprobación
   * @throws {ApprovalPendingError} Cuando la acción requiere aprobación y se crea la ticket
   */
  async evaluateAction(actionType: string, agentId: ID, runId: ID, context?: Record<string, unknown>): Promise<boolean> {
    if (!this.policyEngine) {
      this.logger.warn('Guardian has no PolicyEngine, allowing action by default');
      return true;
    }

    const decision: PolicyDecision = this.policyEngine.evaluate(actionType, {
      agentId,
      runId,
      actionDetails: context ?? {},
    });

    switch (decision.action) {
      case 'block': {
        this.logger.warn('Guardian blocking action', { actionType, agentId, policyId: decision.policyId });

        const blockedPayload: SentinelBlockedPayload = {
          agentId,
          runId,
          actionType,
          reason: decision.reason,
          policyId: decision.policyId ?? ('unknown' as ID),
        };

        const evt = createEvent('sentinel.action.blocked', 'sentinel', blockedPayload);
        this.eventBus.emit(evt);
        return false;
      }

      case 'require-approval': {
        this.logger.info('Guardian requiring approval for action', { actionType, agentId });

        // Crear ticket de aprobación en el ApprovalManager
        // Esto suspende la acción hasta que el usuario apruebe/rechace
        const approvalResult = await this.approvalManager.createApprovalRequest({
          runId,
          agentId,
          actionType,
          actionSummary: `Action ${actionType} requires approval`,
          technicalDetails: JSON.stringify({ actionType, context: context ?? {} }),
          policyId: decision.policyId ?? ('unknown' as ID),
        });

        // Si llegamos aquí, la aprobación fue resuelta (aprobada o rechazada)
        if (!approvalResult.approved) {
          this.logger.info('Approval rejected by user', { runId, agentId, actionType });
          return false;
        }

        this.logger.info('Approval granted by user', { runId, agentId, actionType });
        return true;
      }

      case 'allow':
      default:
        return true;
    }
  }
}
