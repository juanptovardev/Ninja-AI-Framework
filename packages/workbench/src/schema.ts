import type { ID, Timestamp } from '@ninja/contracts';

/**
 * Status of a workspace.
 */
export type WorkspaceStatus = 'active' | 'inactive' | 'archived';

/**
 * Domain entity representing a workspace.
 */
export interface Workspace {
  /** Unique identifier for the workspace */
  id: ID;
  /** Display name of the workspace */
  name: string;
  /** File system path to the workspace */
  path: string;
  /** Current status of the workspace */
  status: WorkspaceStatus;
  /** Creation timestamp */
  createdAt: Timestamp;
  /** Last update timestamp */
  updatedAt: Timestamp;
}

/**
 * Options for creating a new workspace.
 */
export interface CreateWorkspaceOptions {
  /** Name of the workspace */
  name: string;
  /** File system path where the workspace will be created */
  path: string;
}

/**
 * Options for opening an existing workspace.
 */
export interface OpenWorkspaceOptions {
  /** File system path to the existing workspace */
  path: string;
}

/**
 * Context information for an active workspace.
 */
export interface WorkspaceContext {
  /** The workspace entity */
  workspace: Workspace;
  /** Path to the workspace database file */
  dbPath: string;
  /** Path to the .ninja directory */
  ninjaDir: string;
  /** Session ID associated with this context (optional) */
  sessionId?: string;
}
