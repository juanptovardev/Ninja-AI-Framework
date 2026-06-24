// Database functions
export { initDb, closeDb, type Database } from './db.js';

// Migration system
export { runMigrations, type Migration } from './migrations.js';

// Schema types
export type {
  WorkspaceRecord,
  SessionRecord,
  RunRecord,
  ArtifactRecord,
  EventLogRecord,
} from './schema.js';

// Repository classes
export { BaseRepository } from './repositories/base.js';
export { WorkspaceRepository } from './repositories/workspace.repository.js';
