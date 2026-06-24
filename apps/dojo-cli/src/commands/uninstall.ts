import { AgentInstaller, BackupManager } from '@ninja/installer';
import { detectAllClients, ALL_CLIENT_IDS } from '@ninja/roster';
import type { ClientId } from '@ninja/roster';
import { printBanner, printInfo, printError, printDivider } from '../display.js';
import { createLogger } from '@ninja/logging';

const log = createLogger('dojo-cli:uninstall');

/**
 * ninja uninstall [agent|--all] [--restore-backup]
 *
 * Removes Ninja orchestration files from agent config directories.
 * Mirrors Gentle AI's `gentle-ai uninstall` command.
 *
 * Options:
 *   --restore-backup   Restore the most recent backup instead of just removing files
 *
 * Examples:
 *   ninja uninstall                    → remove Ninja files from all detected agents
 *   ninja uninstall claude-code        → remove from Claude Code only
 *   ninja uninstall --restore-backup   → restore all agents to pre-install state
 */
export async function uninstallCommand(args: string[]): Promise<void> {
  printBanner();
  printInfo('Ninja AI Framework — Uninstall');
  printDivider();

  const installer = new AgentInstaller();
  const restoreBackup = args.includes('--restore-backup');
  const uninstallAll = args.filter(a => !a.startsWith('--')).length === 0;

  const targetIds: ClientId[] = uninstallAll
    ? (Object.keys(detectAllClients()) as ClientId[])
    : args.filter(a => !a.startsWith('--')) as ClientId[];

  if (targetIds.length === 0) {
    printInfo('No agents detected on this system.');
    return;
  }

  if (restoreBackup) {
    printInfo('Restoring agents to backup state...\n');
  } else {
    printInfo(`Removing Ninja files from ${targetIds.length} agent(s)...\n`);
  }

  let totalRemoved = 0;

  for (const agentId of targetIds) {
    const result = await installer.uninstall(agentId, restoreBackup);
    totalRemoved += result.removed.length;

    if (result.errors.length > 0) {
      printError(`  ${agentId}: ${result.errors.join(', ')}`);
    } else if (result.backupRestored) {
      console.log(`  ✅  ${agentId} — restored from backup`);
    } else {
      console.log(`  ✅  ${agentId} — ${result.removed.length} file(s) removed`);
    }
  }

  console.log('');
  printDivider();
  console.log(`\n  Uninstall complete: ${totalRemoved} file(s) removed.\n`);
}
