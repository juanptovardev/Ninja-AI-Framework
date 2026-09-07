import Database from 'better-sqlite3';
import { BaseRepository } from '@ninja/storage';

/** Fila de la tabla pulse_metrics (migración 7, WP-C4b). */
export interface PulseMetricRow {
  id: number;
  capturedAt: string;
  metric: string;
  value: number;
  context: string | null;
}

/** Opciones para insertar una métrica de Pulse. */
export interface CreatePulseMetricOptions {
  /** Nombre de la métrica (ej. "stability", "context_efficiency", "llm_latency_ms"). */
  metric: string;
  /** Valor numérico de la métrica. */
  value: number;
  /** Timestamp ISO 8601 (default: ahora). */
  capturedAt?: string;
  /** Contexto JSON opcional (providerId, agentId, taskId...). */
  context?: string | null;
}

/**
 * Repository para pulse_metrics (WP-C4b / F2.5).
 * Persistencia de métricas de Pulse Center con índice (metric, captured_at).
 */
export class PulseMetricRepository extends BaseRepository<PulseMetricRow> {
  constructor(db: Database.Database) {
    super(db, 'pulse_metrics');
  }

  /**
   * Inserta una métrica y devuelve la fila creada.
   * Estructuralmente compatible con el hook MetricPersistence de PulseMonitor.
   */
  insert(options: CreatePulseMetricOptions): PulseMetricRow {
    const capturedAt = options.capturedAt ?? new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO ${this.tableName} (captured_at, metric, value, context) VALUES (?, ?, ?, ?)`
      )
      .run(capturedAt, options.metric, options.value, options.context ?? null);
    return {
      id: Number(result.lastInsertRowid),
      capturedAt,
      metric: options.metric,
      value: options.value,
      context: options.context ?? null,
    };
  }

  /** Últimas N mediciones de una métrica (desc por captured_at). */
  findByMetric(metric: string, limit = 100): PulseMetricRow[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.tableName} WHERE metric = ? ORDER BY captured_at DESC, id DESC LIMIT ?`
      )
      .all(metric, limit);
    return rows.map((row) => this.mapRow(row));
  }

  /** Métricas en un rango ISO 8601 [from, to], opcionalmente filtradas por metric. */
  findByRange(fromIso: string, toIso: string, metric?: string): PulseMetricRow[] {
    const rows = metric
      ? this.db
          .prepare(
            `SELECT * FROM ${this.tableName} WHERE metric = ? AND captured_at BETWEEN ? AND ? ORDER BY captured_at ASC, id ASC`
          )
          .all(metric, fromIso, toIso)
      : this.db
          .prepare(
            `SELECT * FROM ${this.tableName} WHERE captured_at BETWEEN ? AND ? ORDER BY captured_at ASC, id ASC`
          )
          .all(fromIso, toIso);
    return rows.map((row) => this.mapRow(row));
  }

  /** Agregado por métrica en un rango: count, avg, min, max. */
  aggregateByMetric(
    fromIso: string,
    toIso: string
  ): Array<{
    metric: string;
    count: number;
    avg: number;
    min: number;
    max: number;
  }> {
    const rows = this.db
      .prepare(
        `SELECT metric, COUNT(*) as count, AVG(value) as avg, MIN(value) as min, MAX(value) as max
         FROM ${this.tableName} WHERE captured_at BETWEEN ? AND ? GROUP BY metric ORDER BY metric ASC`
      )
      .all(fromIso, toIso) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      metric: r.metric as string,
      count: r.count as number,
      avg: r.avg as number,
      min: r.min as number,
      max: r.max as number,
    }));
  }

  mapRow(row: unknown): PulseMetricRow {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as number,
      capturedAt: r.captured_at as string,
      metric: r.metric as string,
      value: r.value as number,
      context: (r.context as string | null) ?? null,
    };
  }
}
