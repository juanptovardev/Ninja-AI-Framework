import { AgentInstaller, BackupManager } from '@ninja/installer';
import { detectAllClients, detectClient, ALL_CLIENT_IDS } from '@ninja/roster';
import type { ClientId } from '@ninja/roster';
import { printBanner, printInfo, printError, printDivider } from '../display.js';
import { createLogger } from '@ninja/logging';

const log = createLogger('dojo-cli:doctor');

/**
 * ninja doctor [agent|--all]
 *
 * Diagnoses the Ninja installation state for all detected agents.
 * Reports which files are present, missing, and which agents need attention.
 * Mirrors Gentle AI's diagnostic output.
 *
 * Examples:
 *   ninja doctor               → check all detected agents
 *   ninja doctor claude-code   → check only Claude Code
 */
export async function doctorCommand(args: string[]): Promise<void> {
  printBanner();
  printInfo('Ninja AI Framework — Doctor');
  printDivider();
  printInfo('Checking agent configurations...\n');

  const installer = new AgentInstaller();
  const backupManager = new BackupManager();
  
  const targetAll = args.filter(a => !a.startsWith('--')).length === 0;
  const targetIds: ClientId[] = targetAll
    ? (Object.keys(detectAllClients()) as ClientId[])
    : args.filter(a => !a.startsWith('--')) as ClientId[];

  // Also show undetected agents
  const detected = detectAllClients();
  const undetected = ALL_CLIENT_IDS.filter(id => !detected[id]);

  if (targetIds.length === 0) {
    printInfo('No agents detected on this system.');
    console.log('\n  Undetected agents (not installed):');
    for (const id of undetected) {
      console.log(`    ○ ${id}`);
    }
    return;
  }

  let allPassed = true;
  let totalIssues = 0;

  for (const agentId of targetIds) {
    const config = detectClient(agentId);
    const report = await installer.verify(agentId);
    const backups = backupManager.listBackups(agentId);

    const status = report.passed ? '✅' : '⚠️ ';
    if (!report.passed) allPassed = false;

    console.log(`  ${status}  ${agentId}`);

    if (config) {
      console.log(`       Binary:   ${config.executablePath || '(not found)'}`);
      console.log(`       Config:   ${config.configDir}`);
      console.log(`       Tier:     ${config.delegationModel}`);
      console.log(`       Role:     ${config.assignedRole}`);
    }

    if (report.present.length > 0) {
      console.log(`       Present:  ${report.present.length} file(s)`);
    }

    if (report.missing.length > 0) {
      totalIssues += report.missing.length;
      console.log(`       Missing:  ${report.missing.length} file(s) — run: ninja install ${agentId}`);
      for (const f of report.missing) {
        console.log(`         • ${f}`);
      }
    }

    if (report.warnings.length > 0) {
      for (const w of report.warnings) {
        console.log(`       ⚠  ${w}`);
      }
    }

    if (backups.length > 0) {
      console.log(`       Backups:  ${backups.length} available (latest: ${new Date(backups[0].createdAt).toLocaleString()})`);
    }

    console.log('');
  }

  // Show undetected agents
  if (undetected.length > 0 && targetAll) {
    console.log(`  ○  Not installed (${undetected.length}): ${undetected.join(', ')}`);
    console.log('');
  }

  printDivider();
  if (allPassed && totalIssues === 0) {
    console.log('\n  ✅  All agents are correctly configured.\n');
  } else {
    console.log(`\n  Found ${totalIssues} issue(s). Run: ninja install to fix.\n`);
  }
}
