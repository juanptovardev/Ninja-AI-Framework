import type { EventBus, EventSubscription, NinjaEvent } from '@ninja/events';
import type { Logger } from '@ninja/logging';
import type { ID, Timestamp } from '@ninja/contracts';
import type { AuditEntry, SentinelBlockedPayload } from './schema.js';

/**
 * Hook de persistencia del audit log (WP-C4b / F2.5).
 * Estructuralmente compatible con AuditLogRepository.insert (@ninja/trace-ledger).
 */
export type AuditPersistence = (entry: {
  actor: string;
  action: string;
  target?: string | null;
  result: string;
  detail?: string | null;
  createdAt?: string;
}) => { id: number | string };

export class Auditor {
  private readonly auditLog: AuditEntry[] = [];
  private subscriptions: EventSubscription[] = [];
  private readonly persistence: AuditPersistence | null;
  /** Ids ya persistidos (evita duplicados entre log() inmediato y flush() en stop). */
  private readonly persistedIds = new Set<ID>();

  constructor(
    private readonly eventBus: EventBus,
    private readonly logger: Logger,
    persistence?: AuditPersistence
  ) {
    this.persistence = persistence ?? null;
    this.logger.info('Auditor initialized');
  }

  start(): void {
    // Escuchar eventos de Sentinel
    this.subscriptions.push(
      this.eventBus.on('sentinel.action.blocked', (event: NinjaEvent) => {
        const payload = event.payload as SentinelBlockedPayload;
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
        const payload = event.payload as {
          agentId?: ID;
          runId?: ID;
          actionType?: string;
          approved?: boolean;
          notes?: string;
          approvalId?: ID;
        };
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
   * Flush de entradas de auditoría pendientes (WP-C4a/C4b).
   * Con hook de persistencia: escribe en audit_log (SQLite) solo las entradas
   * aún no persistidas. Sin hook: persiste vía logger (nivel info).
   */
  flush(): void {
    if (this.auditLog.length === 0) return;
    let newlyPersisted = 0;
    for (const entry of this.auditLog) {
      if (!this.persistedIds.has(entry.id)) {
        this.persistEntry(entry);
        newlyPersisted++;
      }
    }
    this.logger.info('Audit log flush', {
      entries: this.auditLog.length,
      persisted: this.persistence ? 'sqlite' : 'logger-only',
      newlyPersisted,
      summary: this.auditLog.map((e) => `${e.actionType}:${e.result}`).join(','),
    });
  }

  /**
   * Persiste una entrada vía el hook y la marca como persistida.
   * Nunca lanza: la auditoría en memoria es la fuente de verdad del runtime,
   * la persistencia es best-effort y su fallo se loguea.
   */
  private persistEntry(entry: AuditEntry): void {
    if (!this.persistence) return;
    try {
      this.persistence({
        actor: entry.agentId ?? 'unknown',
        action: entry.actionType,
        target: entry.runId ?? entry.approvalId ?? null,
        result: entry.result,
        detail: entry.reason ?? null,
        createdAt: entry.timestamp,
      });
      this.persistedIds.add(entry.id);
    } catch (err) {
      this.logger.error('Audit persistence failed', err);
    }
  }

  log(entry: AuditEntry): void {
    this.auditLog.push(entry);
    this.logger.debug('Audit entry created', {
      entryId: entry.id,
      actionType: entry.actionType,
      result: entry.result,
    });
    if (this.persistence) {
      this.persistEntry(entry);
    }
  }

  getAuditLog(): AuditEntry[] {
    return [...this.auditLog];
  }
}
