import Database from 'better-sqlite3';
import { WorkspaceRecord } from '../schema.js';
import { BaseRepository } from './base.js';
import { randomUUID } from 'crypto';

/**
 * Repository for managing Workspace entities.
 */
export class WorkspaceRepository extends BaseRepository<WorkspaceRecord> {
  constructor(db: Database.Database) {
    super(db, 'workspaces');
  }

  /**
   * Creates a new workspace.
   *
   * @param data - Partial workspace data (excluding id, createdAt, updatedAt)
   * @returns The created workspace record
   */
  create(data: Omit<WorkspaceRecord, 'id' | 'createdAt' | 'updatedAt'>): WorkspaceRecord {
    const id = randomUUID(); // Generate a new ID
    const now = new Date().toISOString();

    const workspace: WorkspaceRecord = {
      id,
      name: data.name,
      path: data.path,
      createdAt: now,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO workspaces (id, name, path, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      workspace.id,
      workspace.name,
      workspace.path,
      workspace.createdAt,
      workspace.updatedAt
    );

    return workspace;
  }

  /**
   * Finds a workspace by its path.
   *
   * @param path - File system path of the workspace
   * @returns The workspace if found, null otherwise
   */
  findByPath(path: string): WorkspaceRecord | null {
    const stmt = this.db.prepare('SELECT * FROM workspaces WHERE path = ?');
    const row = stmt.get(path);
    return row ? this.mapRow(row) : null;
  }

  /**
   * Updates a workspace.
   *
   * @param id - ID of the workspace to update
   * @param data - Partial workspace data to update
   * @returns The updated workspace if found, null otherwise
   */
  update(id: string, data: Partial<WorkspaceRecord>): WorkspaceRecord | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const updated: WorkspaceRecord = {
      ...existing,
      ...data,
      id: existing.id, // Ensure ID is preserved
      createdAt: existing.createdAt, // Ensure createdAt is preserved
      updatedAt: new Date().toISOString(),
    };

    const stmt = this.db.prepare(`
      UPDATE workspaces
      SET name = ?, path = ?, updatedAt = ?
      WHERE id = ?
    `);

    stmt.run(updated.name, updated.path, updated.updatedAt, updated.id);

    return updated;
  }

  /**
   * Maps a database row to a WorkspaceRecord.
   *
   * @param row - Database row object
   * @returns WorkspaceRecord object
   */
  mapRow(row: any): WorkspaceRecord {
    return {
      id: row.id,
      name: row.name,
      path: row.path,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
