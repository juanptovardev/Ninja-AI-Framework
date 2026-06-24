import Database from 'better-sqlite3';
import { BaseRepository } from '@ninja/storage';
import { Artifact, ArtifactType, CreateArtifactOptions } from '../schema.js';
import type { ArtifactRecord } from '@ninja/storage';

/**
 * Repository for managing Artifact entities.
 */
export class ArtifactRepository extends BaseRepository<Artifact> {
  constructor(db: Database.Database) {
    super(db, 'artifacts');
  }

  /**
   * Creates a new artifact.
   * @param options Options for creating the artifact
   * @returns The created artifact
   */
  create(options: CreateArtifactOptions): Artifact {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO ${this.tableName} (id, runId, type, name, content, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, options.runId, options.type, options.name, options.content, createdAt);

    // Return the created artifact
    return {
      id,
      runId: options.runId,
      type: options.type,
      name: options.name,
      content: options.content,
      createdAt,
    };
  }

  /**
   * Finds all artifacts associated with a specific run.
   * @param runId The ID of the run
   * @returns Array of artifacts for the given run
   */
  findByRunId(runId: string): ArtifactRecord[] {
    const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE runId = ?`);
    const rows = stmt.all(runId);
    return rows.map((row) => this.mapRow(row));
  }

  /**
   * Finds all artifacts of a specific type.
   * @param type The type of artifacts to find
   * @returns Array of artifacts of the given type
   */
  findByType(type: string): ArtifactRecord[] {
    const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE type = ?`);
    const rows = stmt.all(type);
    return rows.map((row) => this.mapRow(row));
  }

  /**
   * Maps a database row to an Artifact entity.
   * @param row The database row
   * @returns An Artifact entity
   */
  mapRow(row: unknown): Artifact {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      runId: r.runId as string,
      type: r.type as ArtifactType,
      name: r.name as string,
      content: r.content as string,
      createdAt: r.createdAt as string,
    };
  }
}
