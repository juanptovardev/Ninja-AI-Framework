import type { WorkspaceContext } from './schema.js';
import { NinjaError, ErrorCodes } from '@ninja/contracts';

// Active context module variable
let activeContext: WorkspaceContext | null = null;

/**
 * Sets the active workspace context.
 *
 * @param ctx - The workspace context to set as active
 */
export function setActiveContext(ctx: WorkspaceContext): void {
  activeContext = ctx;
}

/**
 * Gets the current active workspace context.
 *
 * @returns The active workspace context or null if none is set
 */
export function getActiveContext(): WorkspaceContext | null {
  return activeContext;
}

/**
 * Clears the active workspace context.
 */
export function clearActiveContext(): void {
  activeContext = null;
}

/**
 * Gets the active workspace context or throws an error if none is set.
 *
 * @returns The active workspace context
 * @throws Error if no context is active
 */
export function requireActiveContext(): WorkspaceContext {
  if (!activeContext) {
    throw new NinjaError(
      ErrorCodes.WORKBENCH_NO_ACTIVE_CONTEXT,
      'No active workspace context. Please open a workspace first.',
      'runtime'
    );
  }
  return activeContext;
}
