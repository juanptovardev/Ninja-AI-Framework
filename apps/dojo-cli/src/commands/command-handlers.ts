import type { BaseCommand } from './base-command.js';
import { coreCommands } from './commands-core.js';
import { extendedCommands } from './commands-extended.js';

/**
 * Array of all command instances registered in the CLI.
 * 25 core handlers (1–25) + 24 extended handlers (26–49) = 49 total.
 */
export const allCommands: BaseCommand[] = [
  ...coreCommands,
  ...extendedCommands,
];
