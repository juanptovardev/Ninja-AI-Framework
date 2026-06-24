import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { initDb, runMigrations, WorkspaceRepository, type WorkspaceRecord } from '@ninja/storage';
import { resolveConfig, getWorkspaceDbPath, getNinjaWorkspaceDir } from '@ninja/config';
import { ok, err, type Result } from '@ninja/contracts';
import { createLogger } from '@ninja/logging';
import { WORKSPACE_MIGRATIONS } from './migrations/workspace-migrations.js';
import type {
  CreateWorkspaceOptions,
  OpenWorkspaceOptions,
  WorkspaceContext,
  Workspace,
} from './schema.js';

const log = createLogger('workbench');

/**
 * Creates a new workspace.
 *
 * @param options - Options for creating the workspace
 * @returns Result containing the workspace context or an error
 */
export function createWorkspace(options: CreateWorkspaceOptions): Result<WorkspaceContext, Error> {
  try {
    log.info(`Creating workspace '${options.name}' at '${options.path}'`);

    // Validate or create the workspace directory
    if (!existsSync(options.path)) {
      log.debug(`Creating workspace directory at '${options.path}'`);
      mkdirSync(options.path, { recursive: true });
    } else if (!existsSync(options.path)) {
      return err(new Error(`Workspace path does not exist: ${options.path}`));
    }

    // Create .ninja directory
    const ninjaDir = getNinjaWorkspaceDir(options.path);
    if (!existsSync(ninjaDir)) {
      log.debug(`Creating .ninja directory at '${ninjaDir}'`);
      mkdirSync(ninjaDir, { recursive: true });
    }

    // Initialize SQLite database
    const dbPath = getWorkspaceDbPath(options.path);
    log.debug(`Initializing database at '${dbPath}'`);
    const db = initDb(dbPath);

    // Run migrations
    log.debug('Running workspace migrations');
    runMigrations(db, WORKSPACE_MIGRATIONS);

    // Create workspace record
    const workspaceRepo = new WorkspaceRepository(db);
    const workspaceRecord = workspaceRepo.create({
      name: options.name,
      path: options.path,
    });

    // Convert WorkspaceRecord to Workspace domain entity
    const workspace: Workspace = {
      id: workspaceRecord.id,
      name: workspaceRecord.name,
      path: workspaceRecord.path,
      status: 'active',
      createdAt: workspaceRecord.createdAt,
      updatedAt: workspaceRecord.updatedAt,
    };

    const context: WorkspaceContext = {
      workspace,
      dbPath,
      ninjaDir,
    };

    log.info(`Successfully created workspace '${options.name}'`);
    return ok(context);
  } catch (error) {
    log.error(`Failed to create workspace '${options.name}'`, error);
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Opens an existing workspace.
 *
 * @param options - Options for opening the workspace
 * @returns Result containing the workspace context or an error
 */
export function openWorkspace(options: OpenWorkspaceOptions): Result<WorkspaceContext, Error> {
  try {
    log.info(`Opening workspace at '${options.path}'`);

    // Validate that the path exists
    if (!existsSync(options.path)) {
      return err(new Error(`Workspace path does not exist: ${options.path}`));
    }

    // Validate that .ninja/workspace.db exists
    const dbPath = getWorkspaceDbPath(options.path);
    if (!existsSync(dbPath)) {
      return err(new Error(`Workspace database not found at: ${dbPath}`));
    }

    // Open database connection
    log.debug(`Opening database at '${dbPath}'`);
    const db = initDb(dbPath);

    // Find workspace in repository
    const workspaceRepo = new WorkspaceRepository(db);
    const workspaceRecord = workspaceRepo.findByPath(options.path);

    if (!workspaceRecord) {
      return err(new Error(`Workspace not found in database for path: ${options.path}`));
    }

    // Convert WorkspaceRecord to Workspace domain entity
    const workspace: Workspace = {
      id: workspaceRecord.id,
      name: workspaceRecord.name,
      path: workspaceRecord.path,
      status: 'active',
      createdAt: workspaceRecord.createdAt,
      updatedAt: workspaceRecord.updatedAt,
    };

    const ninjaDir = getNinjaWorkspaceDir(options.path);
    const context: WorkspaceContext = {
      workspace,
      dbPath,
      ninjaDir,
    };

    log.info(`Successfully opened workspace '${workspace.name}'`);
    return ok(context);
  } catch (error) {
    log.error(`Failed to open workspace at '${options.path}'`, error);
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Lists workspaces registered in the given directory.
 *
 * @param baseDir - Base directory to search for workspaces
 * @returns Array of workspace records
 */
export function listWorkspaces(baseDir: string): WorkspaceRecord[] {
  // This is a simplified implementation
  // In a real implementation, this would search for workspaces in the directory
  log.warn('listWorkspaces is not fully implemented');
  return [];
}
