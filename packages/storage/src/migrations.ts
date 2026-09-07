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
  /** Function that reverts the migration (Gate 4 §3.1: up AND down). */
  down?: (db: Database.Database) => void;
}

/** Resultado de revertMigration — sin throws para API determinista. */
export interface RevertResult {
  reverted: boolean;
  reason?: 'not-found' | 'no-down-path' | 'not-applied';
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

/**
 * Revierte la ÚLTIMA migración aplicada que tenga down path (Gate 4 §3.1).
 * Ejecuta down dentro de una transacción y borra su fila de __migrations.
 * Idempotente: re-ejecutar sobre la misma DB es seguro.
 *
 * @param db - Database instance
 * @param migrations - Array de migraciones conocidas (las mismas que runMigrations)
 */
export function revertMigrations(db: Database.Database, migrations: Migration[]): RevertResult {
  // La tabla __migrations puede no existir aún (nunca se migró)
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__migrations'")
    .get();
  if (!table) {
    log.warn('revertMigrations: __migrations table does not exist — nothing to revert');
    return { reverted: false, reason: 'not-applied' };
  }

  const applied = db.prepare('SELECT id FROM __migrations ORDER BY id DESC').all() as {
    id: number;
  }[];
  if (applied.length === 0) {
    log.info('revertMigrations: no applied migrations — nothing to revert');
    return { reverted: false, reason: 'not-applied' };
  }

  // Buscar la última aplicada que exista en el registro conocido Y tenga down
  for (const appliedRow of applied) {
    const migration = migrations.find((m) => m.id === appliedRow.id);
    if (!migration) {
      log.warn(
        `revertMigrations: applied migration ${appliedRow.id} is not in the known registry — skipping`
      );
      continue;
    }
    const down = migration.down;
    if (!down) {
      log.warn(
        `revertMigrations: migration ${migration.id} (${migration.name}) has no down path — skipping`
      );
      continue;
    }

    const transaction = db.transaction(() => {
      down(db);
      db.prepare('DELETE FROM __migrations WHERE id = ?').run(migration.id);
    });
    transaction();

    log.info(`Reverted migration ${migration.id}: ${migration.name}`);
    return { reverted: true };
  }

  return { reverted: false, reason: 'no-down-path' };
}
