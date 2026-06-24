import { AgentInstaller } from '@ninja/installer';
import { detectAllClients, ALL_CLIENT_IDS } from '@ninja/roster';
import type { ClientId } from '@ninja/roster';
import { printBanner, printInfo, printError, printDivider } from '../display.js';
import { createLogger } from '@ninja/logging';

const log = createLogger('dojo-cli:sync');

/**
 * ninja sync [agent|--all]
 *
 * Re-syncs Ninja orchestration files into agent config directories.
 * Only writes files that have changed (content hash comparison).
 * Mirrors Gentle AI's `gentle-ai sync` command.
 *
 * Use this after updating Ninja to push updated skills/prompts to agents.
 *
 * Examples:
 *   ninja sync                → sync all detected agents
 *   ninja sync --all          → same as above
 *   ninja sync claude-code    → sync only into Claude Code
 */
export async function syncCommand(args: string[]): Promise<void> {
  printBanner();
  printInfo('Ninja AI Framework — Sync');
  printDivider();
  printInfo('Re-syncing Ninja files to agent config directories...\n');

  const installer = new AgentInstaller();
  const syncAll = args.includes('--all') || args.length === 0;

  const targetIds: ClientId[] = syncAll
    ? (Object.keys(detectAllClients()) as ClientId[])
    : args.filter(a => !a.startsWith('--')) as ClientId[];

  if (targetIds.length === 0) {
    printInfo('No agents detected. Run: ninja install first.');
    return;
  }

  let totalUpdated = 0;
  let totalUnchanged = 0;

  for (const agentId of targetIds) {
    const result = await installer.sync(agentId);
    totalUpdated += result.updated.length;
    totalUnchanged += result.unchanged.length;

    if (result.errors.length > 0) {
      printError(`  ${agentId}: ${result.errors.join(', ')}`);
    } else if (result.updated.length > 0) {
      console.log(`  ✅  ${agentId} — ${result.updated.length} file(s) updated`);
    } else {
      console.log(`  ⏭   ${agentId} — already up to date`);
    }
  }

  console.log('');
  printDivider();
  console.log(`\n  Sync complete: ${totalUpdated} file(s) updated, ${totalUnchanged} unchanged.\n`);
}
