import path from 'path';
import os from 'os';

/**
 * Get the global Ninja directory path (~/.ninja).
 * @returns The path to the global Ninja directory.
 */
export function getNinjaGlobalDir(): string {
  return path.join(os.homedir(), '.ninja');
}

/**
 * Get the workspace Ninja directory path ([workspacePath]/.ninja).
 * @param workspacePath - The path to the workspace.
 * @returns The path to the workspace Ninja directory.
 */
export function getNinjaWorkspaceDir(workspacePath: string): string {
  return path.join(workspacePath, '.ninja');
}

/**
 * Get the global config file path (~/.ninja/config.json).
 * @returns The path to the global config file.
 */
export function getGlobalConfigPath(): string {
  return path.join(getNinjaGlobalDir(), 'config.json');
}

/**
 * Get the workspace config file path ([workspacePath]/.ninja/config.json).
 * @param workspacePath - The path to the workspace.
 * @returns The path to the workspace config file.
 */
export function getWorkspaceConfigPath(workspacePath: string): string {
  return path.join(getNinjaWorkspaceDir(workspacePath), 'config.json');
}

/**
 * Get the workspace database file path ([workspacePath]/.ninja/workspace.db).
 * @param workspacePath - The path to the workspace.
 * @returns The path to the workspace database file.
 */
export function getWorkspaceDbPath(workspacePath: string): string {
  return path.join(getNinjaWorkspaceDir(workspacePath), 'workspace.db');
}

/**
 * Get the workspace runs directory path ([workspacePath]/.ninja/runs).
 * @param workspacePath - The path to the workspace.
 * @returns The path to the workspace runs directory.
 */
export function getWorkspaceRunsDir(workspacePath: string): string {
  return path.join(getNinjaWorkspaceDir(workspacePath), 'runs');
}
