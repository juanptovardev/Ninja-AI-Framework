import path from 'path';
import fs from 'fs';
import { initDb, runMigrations, revertMigrations } from '@ninja/storage';
import { getNinjaGlobalDir } from '@ninja/config';
import { WORKSPACE_MIGRATIONS } from './migrations/workspace-migrations.js';

/**
 * db:migrate — aplica migraciones pendientes sobre la DB global (~/.ninja/ninja.db).
 * Gate 4 (§3.1): toma backup del archivo antes de aplicar.
 * Con --down revierte la última migración aplicada que tenga down path.
 *
 * Uso:
 *   node dist/migrate.js          # up (aplica pendientes, con backup previo)
 *   node dist/migrate.js --down   # down (revierte la última, con backup previo)
 */
async function main() {
  try {
    const dbDir = getNinjaGlobalDir();
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path.join(dbDir, 'ninja.db');
    const downMode = process.argv.includes('--down');

    // Gate 4 §3.1: backup del archivo DB antes de aplicar/revertir
    if (fs.existsSync(dbPath)) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${dbPath}.bak-${ts}`;
      fs.copyFileSync(dbPath, backupPath);
      console.log(`Gate 4 backup: ${backupPath}`);
    }

    console.log(`${downMode ? 'Reverting' : 'Running'} migrations on database: ${dbPath}`);
    const db = initDb(dbPath);
    try {
      if (downMode) {
        const result = revertMigrations(db, WORKSPACE_MIGRATIONS);
        if (result.reverted) {
          console.log('Last migration reverted successfully.');
        } else {
          console.log(`Nothing reverted (${result.reason ?? 'unknown'}).`);
        }
      } else {
        runMigrations(db, WORKSPACE_MIGRATIONS);
        console.log('Database migrations completed successfully.');
      }
    } finally {
      db.close();
    }
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

main();
