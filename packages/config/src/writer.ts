import fs from 'fs';
import path from 'path';
import { NinjaGlobalConfig, NinjaWorkspaceConfig } from './schema.js';
import {
  getGlobalConfigPath,
  getWorkspaceConfigPath,
  getNinjaGlobalDir,
  getNinjaWorkspaceDir,
} from './paths.js';

/**
 * Write or update the global configuration to ~/.ninja/config.json.
 * @param config - Partial global configuration to write.
 */
export function writeGlobalConfig(config: Partial<NinjaGlobalConfig>): void {
  const globalDir = getNinjaGlobalDir();
  const configPath = getGlobalConfigPath();

  // Create the global directory if it doesn't exist
  if (!fs.existsSync(globalDir)) {
    fs.mkdirSync(globalDir, { recursive: true });
  }

  // Load existing config or use defaults
  let existingConfig: NinjaGlobalConfig;
  if (fs.existsSync(configPath)) {
    try {
      const configFile = fs.readFileSync(configPath, 'utf-8');
      existingConfig = JSON.parse(configFile);
    } catch (error) {
      existingConfig = {
        runtimePort: 3141,
        runtimeHost: '127.0.0.1',
        logLevel: 'info',
        defaultWorkspacePath: '',
      };
    }
  } else {
    existingConfig = {
      runtimePort: 3141,
      runtimeHost: '127.0.0.1',
      logLevel: 'info',
      defaultWorkspacePath: '',
    };
  }

  // Merge the provided config with existing config
  const newConfig = { ...existingConfig, ...config };

  // Write the updated config
  fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
}

/**
 * Write the workspace configuration to [workspacePath]/.ninja/config.json.
 * @param workspacePath - The path to the workspace.
 * @param config - The workspace configuration to write.
 */
export function writeWorkspaceConfig(workspacePath: string, config: NinjaWorkspaceConfig): void {
  const workspaceDir = getNinjaWorkspaceDir(workspacePath);
  const configPath = getWorkspaceConfigPath(workspacePath);

  // Create the workspace directory if it doesn't exist
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true });
  }

  // Write the config
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}
