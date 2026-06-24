// Schema types
export type {
  WorkspaceStatus,
  Workspace,
  CreateWorkspaceOptions,
  OpenWorkspaceOptions,
  WorkspaceContext,
} from './schema.js';

// Workspace functions
export { createWorkspace, openWorkspace, listWorkspaces } from './workspace.js';

// Context management
export {
  setActiveContext,
  getActiveContext,
  clearActiveContext,
  requireActiveContext,
} from './context.js';

// Migrations
export { WORKSPACE_MIGRATIONS } from './migrations/workspace-migrations.js';
