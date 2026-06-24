import fs from 'fs';
import path from 'path';
import {
  NinjaGlobalConfig,
  NinjaWorkspaceConfig,
  ResolvedConfig,
  DEFAULT_GLOBAL_CONFIG,
} from './schema.js';
import {
  getGlobalConfigPath,
  getWorkspaceConfigPath,
  getNinjaGlobalDir,
  getNinjaWorkspaceDir,
} from './paths.js';
import { RuntimeConfig } from '@ninja/contracts';

/**
 * Load the global configuration from ~/.ninja/config.json.
 * If the file doesn't exist, returns the default configuration.
 * @returns The global configuration.
 */
export function loadGlobalConfig(): NinjaGlobalConfig {
  const configPath = getGlobalConfigPath();

  // Create the global directory if it doesn't exist
  const globalDir = getNinjaGlobalDir();
  if (!fs.existsSync(globalDir)) {
    fs.mkdirSync(globalDir, { recursive: true });
  }

  // If config file doesn't exist, return defaults
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_GLOBAL_CONFIG };
  }

  try {
    const configFile = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configFile);

    // Merge with defaults to ensure all fields are present
    return {
      ...DEFAULT_GLOBAL_CONFIG,
      ...config,
    };
  } catch (error) {
    // If there's an error parsing, return defaults
    return { ...DEFAULT_GLOBAL_CONFIG };
  }
}

/**
 * Load the workspace configuration from [workspacePath]/.ninja/config.json.
 * @param workspacePath - The path to the workspace.
 * @returns The workspace configuration or null if not found.
 */
export function loadWorkspaceConfig(workspacePath: string): NinjaWorkspaceConfig | null {
  const configPath = getWorkspaceConfigPath(workspacePath);

  // Create the workspace directory if it doesn't exist
  const workspaceDir = getNinjaWorkspaceDir(workspacePath);
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true });
  }

  // If config file doesn't exist, return null
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const configFile = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configFile);
    return config;
  } catch (error) {
    // If there's an error parsing, return null
    return null;
  }
}

/**
 * Resolve the complete configuration by merging global and workspace settings.
 * @param workspacePath - Optional path to the workspace.
 * @returns The resolved configuration.
 */
export function resolveConfig(workspacePath?: string): ResolvedConfig {
  const globalConfig = loadGlobalConfig();
  const workspaceConfig = workspacePath ? loadWorkspaceConfig(workspacePath) : null;

  // Build the runtime config by applying workspace overrides if present
  const runtimeConfig: RuntimeConfig = {
    port: workspaceConfig?.runtimePort ?? globalConfig.runtimePort,
    host: globalConfig.runtimeHost,
    logLevel: workspaceConfig?.logLevel ?? globalConfig.logLevel,
  };

  return {
    runtime: runtimeConfig,
    workspace: workspaceConfig,
    global: globalConfig,
    workspacePath: workspacePath ?? null,
  };
}
