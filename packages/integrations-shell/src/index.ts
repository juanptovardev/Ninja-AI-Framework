/**
 * @ninja/integrations-shell - index.ts
 * Barrel export del paquete de integración con shell/terminal.
 */

// Re-exports de executor
export { executeCommand, type ShellCommand, type ShellResult } from './executor.js';

// Re-exports de sandbox
export { validateCommand, type ValidationResult } from './sandbox.js';

// Re-exports de logger
export { logExecution } from './logger.js';

// Re-exports de errores
export type { ShellCommandBlockedError, ShellTimeoutError, ShellSpawnError } from './executor.js';
