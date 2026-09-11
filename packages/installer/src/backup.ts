import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { createLogger } from '@ninja/logging';
import type { ClientId } from '@ninja/roster';
import { NinjaError, ErrorCodes } from '@ninja/contracts';
import type { BackupManifest } from './types.js';

const log = createLogger('installer:backup');

const BACKUP_DIR = path.join(os.homedir(), '.ninja', 'backups');

/**
 * BackupManager — creates and restores timestamped config backups.
 * Mirrors Gentle AI's internal/backup package.
 *
 * Before any file injection, call createBackup() to snapshot the current
 * state of the agent's config directory. If injection fails, call restore().
 */
export class BackupManager {
  private backupDir: string;

  constructor(backupDir?: string) {
    this.backupDir = backupDir || BACKUP_DIR;
  }

  /**
   * Creates a backup of the specified files in the agent's config directory.
   * Returns a BackupManifest that can be used to restore later.
   */
  async createBackup(
    agentId: ClientId,
    configDir: string,
    description?: string
  ): Promise<BackupManifest> {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.backupDir, `${timestamp}-${agentId}-${id.slice(0, 8)}`);

    fs.mkdirSync(backupPath, { recursive: true });

    const files: string[] = [];

    // Snapshot every file in the configDir (recursively)
    if (fs.existsSync(configDir)) {
      const allFiles = this.listFilesRecursive(configDir);

      for (const file of allFiles) {
        const relative = path.relative(configDir, file);
        const dest = path.join(backupPath, relative);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(file, dest);
        files.push(relative);
      }
    }

    const manifest: BackupManifest = {
      id,
      agentId,
      createdAt: new Date().toISOString(),
      backupPath,
      files,
      description,
    };

    // Write manifest file
    fs.writeFileSync(
      path.join(backupPath, '_manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );

    log.info(`Backup created for ${agentId}: ${backupPath} (${files.length} files)`);
    return manifest;
  }

  /**
   * Restores files from a backup manifest to the original config directory.
   */
  async restore(manifest: BackupManifest, configDir: string): Promise<void> {
    if (!fs.existsSync(manifest.backupPath)) {
      throw new NinjaError(
        ErrorCodes.INSTALLER_BACKUP_NOT_FOUND,
        `Backup path not found: ${manifest.backupPath}`,
        'runtime'
      );
    }

    for (const relative of manifest.files) {
      const src = path.join(manifest.backupPath, relative);
      const dest = path.join(configDir, relative);

      if (!fs.existsSync(src)) {
        log.warn(`Backup file not found: ${src}`);
        continue;
      }

      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }

    log.info(
      `Restored ${manifest.files.length} files from backup ${manifest.id} for ${manifest.agentId}`
    );
  }

  /**
   * Lists all available backups for a given agent.
   */
  listBackups(agentId?: ClientId): BackupManifest[] {
    if (!fs.existsSync(this.backupDir)) return [];

    const results: BackupManifest[] = [];

    for (const entry of fs.readdirSync(this.backupDir)) {
      const manifestPath = path.join(this.backupDir, entry, '_manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifest: BackupManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (!agentId || manifest.agentId === agentId) {
          results.push(manifest);
        }
      } catch {
        // Ignore corrupt manifests
      }
    }

    return results.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Deletes a backup by its manifest.
   */
  deleteBackup(manifest: BackupManifest): void {
    if (fs.existsSync(manifest.backupPath)) {
      fs.rmSync(manifest.backupPath, { recursive: true, force: true });
      log.info(`Deleted backup ${manifest.id}`);
    }
  }

  private listFilesRecursive(dir: string): string[] {
    const results: string[] = [];

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.listFilesRecursive(fullPath));
      } else {
        results.push(fullPath);
      }
    }

    return results;
  }
}
