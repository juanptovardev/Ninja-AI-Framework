import { AgentInstaller } from '@ninja/installer';
import { detectAllClients, detectClient, ALL_CLIENT_IDS } from '@ninja/roster';
import type { ClientId } from '@ninja/roster';
import { printBanner, printInfo, printError, printDivider } from '../display.js';
import { createLogger } from '@ninja/logging';

const log = createLogger('dojo-cli:install');

/**
 * ninja install [agent|--all]
 *
 * Installs Ninja orchestration files into AI agent config directories.
 * Mirrors Gentle AI's `gentle-ai install` command.
 *
 * Examples:
 *   ninja install               → interactive: detect and install into all found agents
 *   ninja install --all         → install into all detected agents
 *   ninja install claude-code   → install only into Claude Code
 *   ninja install cursor codex  → install into specific agents
 */
export async function installCommand(args: string[]): Promise<void> {
  printBanner();
  printInfo('Ninja AI Framework — Install');
  printDivider();

  const installer = new AgentInstaller();
  const installAll = args.includes('--all') || args.length === 0;

  if (installAll) {
    // Detect all installed agents and install into each
    const detected = detectAllClients();
    const detectedIds = Object.keys(detected) as ClientId[];

    if (detectedIds.length === 0) {
      printInfo('No AI agents detected on this system.');
      printInfo('Supported agents: ' + ALL_CLIENT_IDS.join(', '));
      printInfo('');
      printInfo('Install a supported agent first, then run: ninja install');
      return;
    }

    console.log(`\nDetected ${detectedIds.length} agent(s):\n`);
    for (const id of detectedIds) {
      const cfg = detected[id];
      console.log(`  • ${cfg.name} (${cfg.delegationModel}) — ${cfg.configDir}`);
    }
    console.log('');

    printInfo('Installing Ninja orchestration files...\n');

    const results = await installer.installAll({ backup: true, verify: true });

    console.log('');
    printDivider();
    console.log('');

    let successCount = 0;
    for (const result of results) {
      if (result.success) {
        successCount++;
        console.log(`  ✅  ${result.agentId}`);
        if (result.injected.length > 0) {
          console.log(`       Injected: ${result.injected.length} file(s)`);
        }
        if (result.skipped.length > 0) {
          console.log(`       Unchanged: ${result.skipped.length} file(s)`);
        }
        if (result.verify && result.verify.warnings.length > 0) {
          for (const w of result.verify.warnings) {
            console.log(`       ⚠  ${w}`);
          }
        }
      } else {
        console.log(`  ❌  ${result.agentId}: ${result.errors.join(', ')}`);
      }
    }

    console.log('');
    printDivider();
    console.log(`\n  🚀 Ninja installed into ${successCount}/${results.length} agents.\n`);
    console.log('  Each agent now has:');
    console.log('    • Ninja orchestrator system prompt');
    console.log('    • SDD phase agent files (for full-delegation agents)');
    console.log('    • Ninja MCP server configuration');
    console.log('    • Skill files');
    console.log('');
    console.log('  Next: Start the Kage runtime with: ninja start');
    console.log('');
  } else {
    // Install specific agents
    const targetIds = args.filter(a => !a.startsWith('--')) as ClientId[];
    
    for (const agentId of targetIds) {
      if (!ALL_CLIENT_IDS.includes(agentId)) {
        printError(`Unknown agent: ${agentId}`);
        printInfo(`Supported agents: ${ALL_CLIENT_IDS.join(', ')}`);
        continue;
      }

      printInfo(`Installing into ${agentId}...`);
      const result = await installer.install(agentId, { backup: true, verify: true });

      if (result.success) {
        console.log(`  ✅  ${agentId} — ${result.injected.length} file(s) written`);
        if (result.verify?.warnings.length) {
          for (const w of result.verify.warnings) {
            console.log(`     ⚠  ${w}`);
          }
        }
      } else {
        printError(`Failed to install into ${agentId}:\n  ${result.errors.join('\n  ')}`);
      }
    }
  }
}
