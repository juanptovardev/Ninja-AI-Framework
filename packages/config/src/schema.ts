import type { RuntimeConfig, LogLevel } from '@ninja/contracts';

/**
 * Global configuration for the Ninja AI Framework.
 * Stored in ~/.ninja/config.json
 */
export interface NinjaGlobalConfig {
  /** Port for the Kage Runtime. Default: 3141 */
  runtimePort: number;
  /** Host for the Kage Runtime. Default: '127.0.0.1' */
  runtimeHost: string;
  /** Log level for the framework. Default: 'info' */
  logLevel: LogLevel;
  /** Default path for new workspaces. */
  defaultWorkspacePath: string;
}

/**
 * Workspace-specific configuration.
 * Stored in [workspacePath]/.ninja/config.json
 */
export interface NinjaWorkspaceConfig {
  /** Name of the workspace */
  name: string;
  /** Version of the workspace */
  version: string;
  /** Optional description of the workspace */
  description?: string;
  /** Optional override for runtime port */
  runtimePort?: number;
  /** Optional override for log level */
  logLevel?: LogLevel;
}

/**
 * Resolved configuration combining global and workspace settings.
 */
export interface ResolvedConfig {
  /** Runtime configuration derived from global and workspace settings */
  runtime: RuntimeConfig;
  /** Workspace configuration (null if not in a workspace) */
  workspace: NinjaWorkspaceConfig | null;
  /** Global configuration */
  global: NinjaGlobalConfig;
  /** Path to the workspace (null if not in a workspace) */
  workspacePath: string | null;
}

/**
 * Default values for global configuration.
 */
export const DEFAULT_GLOBAL_CONFIG: NinjaGlobalConfig = {
  runtimePort: 3141,
  runtimeHost: '127.0.0.1',
  logLevel: 'info',
  defaultWorkspacePath: '',
};
