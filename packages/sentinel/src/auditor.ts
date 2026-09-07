import type { EventBus, EventSubscription, NinjaEvent } from '@ninja/events';
import type { Logger } from '@ninja/logging';
import type { ID, Timestamp } from '@ninja/contracts';
import type { AuditEntry } from './schema.js';

export class Auditor {
  private readonly auditLog: AuditEntry[] = [];
  private subscriptions: EventSubscription[] = [];

  constructor(
    private readonly eventBus: EventBus,
    private readonly logger: Logger
  ) {
    this.logger.info('Auditor initialized');
  }

  start(): void {
    // Escuchar eventos de Sentinel
    this.subscriptions.push(
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
          policyId: payload.policyId,
        });
      })
    );

    this.subscriptions.push(
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
          approvalId: payload.approvalId,
        });
      })
    );
  }

  /**
   * Detiene la auditoría: cancela suscripciones y hace flush de las entradas
   * pendientes al logger (WP-C4a — Auditor flush antes del cierre de DB).
   */
  stop(): void {
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.subscriptions = [];
    this.flush();
    this.logger.info('Auditor stopped — entries flushed', { count: this.auditLog.length });
  }

  /**
   * Flush de entradas de auditoría pendientes.
   * Hoy el audit log es in-memory; el flush lo persiste vía logger (nivel info)
   * para que ninguna entrada se pierda en el cierre. Cuando WP-C4b migre el
   * audit log a SQLite (tabla audit_log), este método escribirá ahí.
   */
  flush(): void {
    if (this.auditLog.length === 0) return;
    this.logger.info('Audit log flush', {
      entries: this.auditLog.length,
      summary: this.auditLog.map((e) => `${e.actionType}:${e.result}`).join(','),
    });
  }

  log(entry: AuditEntry): void {
    this.auditLog.push(entry);
    this.logger.debug('Audit entry created', {
      entryId: entry.id,
      actionType: entry.actionType,
      result: entry.result,
    });
  }

  getAuditLog(): AuditEntry[] {
    return [...this.auditLog];
  }
}
