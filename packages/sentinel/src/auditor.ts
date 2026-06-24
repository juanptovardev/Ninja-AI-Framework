import type { EventBus, NinjaEvent } from '@ninja/events';
import type { Logger } from '@ninja/logging';
import type { ID, Timestamp } from '@ninja/contracts';
import type { AuditEntry } from './schema.js';

export class Auditor {
  private readonly auditLog: AuditEntry[] = [];
  
  constructor(
    private readonly eventBus: EventBus,
    private readonly logger: Logger
  ) {
    this.logger.info('Auditor initialized');
  }

  start(): void {
    // Escuchar eventos de Sentinel
    this.eventBus.on('sentinel.action.blocked', (event: NinjaEvent) => {
       const payload = event.payload as any;
       this.log({
          id: crypto.randomUUID() as ID,
          timestamp: new Date().toISOString() as Timestamp,
          agentId: payload.agentId,
          runId: payload.runId,
          actionType: payload.actionType || 'unknown',
          action: 'block',
          result: 'blocked',
          reason: payload.reason || 'Blocked by policy',
          policyId: payload.policyId
       });
    });

    this.eventBus.on('sentinel.approval.received', (event: NinjaEvent) => {
       const payload = event.payload as any;
       this.log({
          id: crypto.randomUUID() as ID,
          timestamp: new Date().toISOString() as Timestamp,
          agentId: payload.agentId,
          runId: payload.runId,
          actionType: payload.actionType || 'unknown',
          action: payload.approved ? 'allow' : 'block',
          result: payload.approved ? 'approved' : 'rejected',
          reason: payload.notes || 'Approval response',
          approvalId: payload.approvalId
       });
    });
  }

  log(entry: AuditEntry): void {
     this.auditLog.push(entry);
     this.logger.debug('Audit entry created', { entryId: entry.id, actionType: entry.actionType, result: entry.result });
  }

  getAuditLog(): AuditEntry[] {
     return [...this.auditLog];
  }
}
