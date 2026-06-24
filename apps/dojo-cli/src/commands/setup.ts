import { RosterManager } from '@ninja/roster';
import { AgentInstaller } from '@ninja/installer';
import { printBanner, printInfo, printError, printDivider } from '../display.js';
import { createLogger } from '@ninja/logging';

const log = createLogger('dojo-cli:setup');

/**
 * ninja setup — legacy quick-setup command.
 * 
 * Runs the roster detection and then delegates to the installer pipeline.
 * For full control, use:
 *   ninja install           (install Ninja into all detected agents)
 *   ninja doctor            (diagnose agent configurations)
 *   ninja sync              (re-sync updated files)
 */
export async function setupCommand(): Promise<void> {
  printBanner();
  console.log('         Welcome to the Ninja AI Framework Setup Wizard!');
  printDivider();

  try {
    // 1. Initialize Roster Manager
    printInfo('\n--- Step 1: Auto-detecting AI agents ---\n');
    const rosterManager = new RosterManager();
    rosterManager.unlock();
    rosterManager.detectAndSync();
    const roster = rosterManager.getRoster();

    if (Object.keys(roster.clients).length === 0) {
      printInfo('No AI agents detected on this system.');
      printInfo('');
      printInfo('Supported agents: claude-code, codex, cursor, opencode, gemini-cli,');
      printInfo('  windsurf, vscode-copilot, kimi-code, kiro-ide, qwen-code, antigravity-2, ...');
      printInfo('');
      printInfo('Install a supported agent first, then run: ninja setup');
      return;
    }

    console.log('Detected agents:');
    for (const [id, client] of Object.entries(roster.clients)) {
      console.log(`  ✓ ${client.name} (Role: ${client.assignedRole}, Delegation: ${client.delegationModel})`);
    }

    // 2. Run the installer pipeline for all detected agents
    printInfo('\n--- Step 2: Installing Ninja orchestration files ---\n');
    printInfo('This will inject system prompts, skills, SDD agents, and MCP config\n');
    printInfo('into each detected agent\'s config directory.\n');

    const installer = new AgentInstaller();
    const results = await installer.installAll({ backup: true, verify: true });

    let successCount = 0;
    for (const result of results) {
      if (result.success) {
        successCount++;
        console.log(`  ✅  ${result.agentId} — ${result.injected.length} file(s) injected`);
        if (result.verify && !result.verify.passed) {
          for (const w of result.verify.warnings) {
            console.log(`     ⚠  ${w}`);
          }
        }
      } else {
        console.log(`  ❌  ${result.agentId}: ${result.errors.join(', ')}`);
      }
    }

    printDivider();
    console.log(`\n  🚀 NINJA SETUP COMPLETE! (${successCount}/${results.length} agents configured)\n`);
    console.log('  Each agent now has:');
    console.log('    • Ninja orchestrator system prompt');
    console.log('    • SDD phase agent files (full-delegation agents only)');
    console.log('    • MCP server configuration');
    console.log('    • Skill files\n');
    console.log('  Commands:');
    console.log('    ninja start             Start the Kage runtime server');
    console.log('    ninja doctor            Verify all agent configurations');
    console.log('    ninja sync              Re-sync updated files to agents');
    console.log('');

  } catch (err: any) {
    printError(`Setup failed: ${err.message || String(err)}`);
  }
}
