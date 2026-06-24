import Database from 'better-sqlite3';
import { createLogger } from '@ninja/logging';

const log = createLogger('storage');

/**
 * Initializes a SQLite database connection.
 *
 * @param dbPath - Path to the SQLite database file
 * @returns Database instance
 */
export function initDb(dbPath: string): Database.Database {
  log.debug(`Initializing database at ${dbPath}`);

  const db = new Database(dbPath);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  log.info('Database initialized successfully');
  return db;
}

/**
 * Closes the database connection cleanly.
 *
 * @param db - Database instance to close
 */
export function closeDb(db: Database.Database): void {
  log.debug('Closing database connection');
  db.close();
  log.info('Database connection closed');
}

export type { Database };
