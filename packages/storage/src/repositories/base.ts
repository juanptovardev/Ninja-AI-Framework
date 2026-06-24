import Database from 'better-sqlite3';

/**
 * Abstract base repository class providing common CRUD operations.
 *
 * @template T - The type of entity this repository manages
 */
export abstract class BaseRepository<T> {
  protected db: Database.Database;
  protected tableName: string;

  /**
   * Creates a new base repository.
   *
   * @param db - Database instance
   * @param tableName - Name of the table this repository manages
   */
  constructor(db: Database.Database, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  /**
   * Finds an entity by its ID.
   *
   * @param id - ID of the entity to find
   * @returns The entity if found, null otherwise
   */
  findById(id: string): T | null {
    const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`);
    const row = stmt.get(id);
    return row ? this.mapRow(row) : null;
  }

  /**
   * Finds all entities.
   *
   * @returns Array of all entities
   */
  findAll(): T[] {
    const stmt = this.db.prepare(`SELECT * FROM ${this.tableName}`);
    const rows = stmt.all();
    return rows.map((row) => this.mapRow(row));
  }

  /**
   * Deletes an entity by its ID.
   *
   * @param id - ID of the entity to delete
   * @returns True if an entity was deleted, false otherwise
   */
  deleteById(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Maps a database row to an entity object.
   * Must be implemented by subclasses.
   *
   * @param row - Database row object
   * @returns Entity object
   */
  abstract mapRow(row: unknown): T;
}
