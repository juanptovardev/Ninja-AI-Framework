import Database from 'better-sqlite3';
import { BaseRepository } from '@ninja/storage';

/** Fila de la tabla audit_log (migración 8, WP-C4b). */
export interface AuditLogRow {
  id: number;
  createdAt: string;
  actor: string;
  action: string;
  target: string | null;
  result: string;
  detail: string | null;
}

/** Opciones para insertar una entrada de auditoría. */
export interface CreateAuditLogOptions {
  /** Quién ejecutó la acción (agente, operador, sistema). */
  actor: string;
  /** Acción (ej. "sentinel.block", "approval.granted", "audit.flush"). */
  action: string;
  /** Objetivo opcional (runId, approvalId, resource...). */
  target?: string | null;
  /** Resultado ("blocked", "approved", "rejected", "ok"...). */
  result: string;
  /** Detalle JSON o texto opcional. */
  detail?: string | null;
  /** Timestamp ISO 8601 (default: ahora). */
  createdAt?: string;
}

/**
 * Repository para audit_log (WP-C4b / F2.5).
 * Log de auditoría persistente; alimenta el Auditor de Sentinel.
 */
export class AuditLogRepository extends BaseRepository<AuditLogRow> {
  constructor(db: Database.Database) {
    super(db, 'audit_log');
  }

  /**
   * Inserta una entrada de auditoría y devuelve la fila creada.
   * Estructuralmente compatible con el hook AuditPersistence de Auditor.
   */
  insert(options: CreateAuditLogOptions): AuditLogRow {
    const createdAt = options.createdAt ?? new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO ${this.tableName} (created_at, actor, action, target, result, detail) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        createdAt,
        options.actor,
        options.action,
        options.target ?? null,
        options.result,
        options.detail ?? null
      );
    return {
      id: Number(result.lastInsertRowid),
      createdAt,
      actor: options.actor,
      action: options.action,
      target: options.target ?? null,
      result: options.result,
      detail: options.detail ?? null,
    };
  }

  /** Entradas de un actor, más recientes primero. */
  findByActor(actor: string, limit = 100): AuditLogRow[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.tableName} WHERE actor = ? ORDER BY created_at DESC, id DESC LIMIT ?`
      )
      .all(actor, limit);
    return rows.map((row) => this.mapRow(row));
  }

  /** Entradas en un rango ISO 8601 [from, to], opcionalmente filtradas por action. */
  findByRange(fromIso: string, toIso: string, action?: string): AuditLogRow[] {
    const rows = action
      ? this.db
          .prepare(
            `SELECT * FROM ${this.tableName} WHERE action = ? AND created_at BETWEEN ? AND ? ORDER BY created_at ASC, id ASC`
          )
          .all(action, fromIso, toIso)
      : this.db
          .prepare(
            `SELECT * FROM ${this.tableName} WHERE created_at BETWEEN ? AND ? ORDER BY created_at ASC, id ASC`
          )
          .all(fromIso, toIso);
    return rows.map((row) => this.mapRow(row));
  }

  mapRow(row: unknown): AuditLogRow {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as number,
      createdAt: r.created_at as string,
      actor: r.actor as string,
      action: r.action as string,
      target: (r.target as string | null) ?? null,
      result: r.result as string,
      detail: (r.detail as string | null) ?? null,
    };
  }
}
