import Database from 'better-sqlite3';
import { createLogger } from '@ninja/logging';

const log = createLogger('storage-migrations');

/**
 * Migration interface defining the structure of a database migration.
 */
export interface Migration {
  /** Unique identifier for the migration */
  id: number;
  /** Human-readable name of the migration */
  name: string;
  /** Function that applies the migration to the database */
  up: (db: Database.Database) => void;
}

/**
 * Runs pending migrations on the database.
 *
 * @param db - Database instance
 * @param migrations - Array of migrations to apply
 */
export function runMigrations(db: Database.Database, migrations: Migration[]): void {
  log.info(`Running ${migrations.length} migrations`);

  // Create migrations table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS __migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get already executed migrations
  const executedMigrations = db.prepare('SELECT id FROM __migrations ORDER BY id').all() as {
    id: number;
  }[];

  const executedIds = new Set(executedMigrations.map((m) => m.id));
  let appliedCount = 0;

  // Execute pending migrations
  for (const migration of migrations) {
    if (executedIds.has(migration.id)) {
      log.debug(`Skipping already executed migration ${migration.id}: ${migration.name}`);
      continue;
    }

    log.info(`Applying migration ${migration.id}: ${migration.name}`);

    try {
      // Run migration in a transaction
      const transaction = db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT INTO __migrations (id, name) VALUES (?, ?)').run(
          migration.id,
          migration.name
        );
      });

      transaction();
      appliedCount++;
      log.debug(`Successfully applied migration ${migration.id}: ${migration.name}`);
    } catch (error) {
      log.error(`Failed to apply migration ${migration.id}: ${migration.name}`, error);
      throw error;
    }
  }

  log.info(`Migration run completed. Applied ${appliedCount} new migrations.`);
}
