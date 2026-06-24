import path from 'path';
import fs from 'fs';
import { initDb, runMigrations } from '@ninja/storage';
import { getNinjaGlobalDir } from '@ninja/config';
import { WORKSPACE_MIGRATIONS } from './migrations/workspace-migrations.js';

async function main() {
  try {
    const dbDir = getNinjaGlobalDir();
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path.join(dbDir, 'ninja.db');
    console.log(`Running migrations on database: ${dbPath}`);
    const db = initDb(dbPath);
    runMigrations(db, WORKSPACE_MIGRATIONS);
    db.close();
    console.log('Database migrations completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

main();
