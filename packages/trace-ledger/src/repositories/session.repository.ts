import Database from 'better-sqlite3';
import { BaseRepository } from '@ninja/storage';
import { Session, CreateSessionOptions } from '../schema.js';
import type { SessionRecord } from '@ninja/storage';

/**
 * Repository for managing Session entities.
 */
export class SessionRepository extends BaseRepository<Session> {
  constructor(db: Database.Database) {
    super(db, 'sessions');
  }

  /**
   * Creates a new session.
   * @param options Options for creating the session
   * @returns The created session
   */
  create(options: CreateSessionOptions): Session {
    const id = crypto.randomUUID();

    const stmt = this.db.prepare(`
      INSERT INTO ${this.tableName} (id, workspaceId, startedAt, endedAt)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(id, options.workspaceId, options.startedAt, null);

    // Return the created session
    return {
      id,
      workspaceId: options.workspaceId,
      startedAt: options.startedAt,
      endedAt: null,
    };
  }

  /**
   * Closes (ends) a session by setting its endedAt timestamp.
   * @param id The ID of the session to close
   * @returns The updated session or null if not found
   */
  closeSession(id: string): Session | null {
    const stmt = this.db.prepare(`
      UPDATE ${this.tableName}
      SET endedAt = ?
      WHERE id = ?
    `);

    const result = stmt.run(new Date().toISOString(), id);

    if (result.changes > 0) {
      return this.findById(id);
    }

    return null;
  }

  /**
   * Finds all sessions for a specific workspace.
   * @param workspaceId The ID of the workspace
   * @returns Array of sessions for the given workspace
   */
  findByWorkspaceId(workspaceId: string): SessionRecord[] {
    const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE workspaceId = ?`);
    const rows = stmt.all(workspaceId);
    return rows.map((row) => this.mapRow(row));
  }

  /**
   * Maps a database row to a Session entity.
   * @param row The database row
   * @returns A Session entity
   */
  mapRow(row: unknown): Session {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      workspaceId: r.workspaceId as string,
      startedAt: r.startedAt as string,
      endedAt: r.endedAt as string | null,
    };
  }
}
