/**
 * @ninja/integrations-git - index.ts
 * Barrel export del paquete de integración con git.
 */

// Re-exports de git-client
export {
  GitClient,
  GitError,
  GitNotAvailableError,
  GitRepoNotFoundError,
  GitCommandFailedError,
  GitOperationBlockedError,
  GitParseError,
} from './git-client.js';

// Re-exports de status
export {
  getStatus,
  getBranch,
  getChangedFiles,
  getLog,
  type GitStatus,
  type GitChangedFile,
  type GitCommit,
} from './status.js';

// Re-exports de operations
export {
  stage,
  commit,
  checkout,
  pull,
  getBranches,
  getWorkingDirectoryStatus,
} from './operations.js';
