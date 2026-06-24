import Database from 'better-sqlite3';
import { BaseRepository } from '@ninja/storage';
import { Run, RunStatus, CreateRunOptions } from '../schema.js';
import type { RunRecord } from '@ninja/storage';

/**
 * Repository for managing Run entities.
 */
export class RunRepository extends BaseRepository<Run> {
  constructor(db: Database.Database) {
    super(db, 'runs');
  }

  /**
   * Creates a new run.
   * @param options Options for creating the run
   * @returns The created run
   */
  create(options: CreateRunOptions): Run {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO ${this.tableName} (id, sessionId, mode, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, options.sessionId, options.mode, options.status, timestamp, timestamp);

    // Return the created run
    return {
      id,
      sessionId: options.sessionId,
      mode: options.mode,
      status: options.status,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  /**
   * Updates the status of a run.
   * @param id The ID of the run to update
   * @param status The new status
   * @returns The updated run or null if not found
   */
  updateStatus(id: string, status: RunStatus): Run | null {
    const stmt = this.db.prepare(`
      UPDATE ${this.tableName}
      SET status = ?, updatedAt = ?
      WHERE id = ?
    `);

    const result = stmt.run(status, new Date().toISOString(), id);

    if (result.changes > 0) {
      return this.findById(id);
    }

    return null;
  }

  /**
   * Finds all runs for a specific session.
   * @param sessionId The ID of the session
   * @returns Array of runs for the given session
   */
  findBySessionId(sessionId: string): RunRecord[] {
    const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE sessionId = ?`);
    const rows = stmt.all(sessionId);
    return rows.map((row) => this.mapRow(row));
  }

  /**
   * Maps a database row to a Run entity.
   * @param row The database row
   * @returns A Run entity
   */
  mapRow(row: unknown): Run {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      sessionId: r.sessionId as string,
      mode: r.mode as string,
      status: r.status as RunStatus,
      createdAt: r.createdAt as string,
      updatedAt: r.updatedAt as string,
    };
  }
}
