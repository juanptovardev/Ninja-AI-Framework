// Schema types
export type { NinjaGlobalConfig, NinjaWorkspaceConfig, ResolvedConfig } from './schema.js';
export { DEFAULT_GLOBAL_CONFIG } from './schema.js';

// Loader functions
export { loadGlobalConfig, loadWorkspaceConfig, resolveConfig } from './loader.js';

// Writer functions
export { writeGlobalConfig, writeWorkspaceConfig } from './writer.js';

// Path utilities
export {
  getNinjaGlobalDir,
  getNinjaWorkspaceDir,
  getGlobalConfigPath,
  getWorkspaceConfigPath,
  getWorkspaceDbPath,
  getWorkspaceRunsDir,
} from './paths.js';
