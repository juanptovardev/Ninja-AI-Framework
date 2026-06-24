import fs from 'fs';
import path from 'path';
import { createLogger } from '@ninja/logging';
import type { SDDAgentFile } from './types.js';
import { FileInjector } from './file-injector.js';

const log = createLogger('installer:sdd');

// SDD phase definitions aligned with Gentle AI's SDD workflow
export const SDD_PHASES = [
  'sdd-explore',
  'sdd-propose',
  'sdd-spec',
  'sdd-design',
  'sdd-tasks',
  'sdd-apply',
  'sdd-verify',
  'sdd-archive',
] as const;

export type SDDPhase = typeof SDD_PHASES[number];

/**
 * SDDInstaller — writes SDD phase agent files to agent config directories.
 * Mirrors Gentle AI's internal/components/sdd pipeline.
 *
 * Only applies to agents with delegationModel === 'full'.
 * For solo-agents, SDD runs inline and no agent files are needed.
 *
 * Agents with native agent systems:
 *   - Cursor: writes to ~/.cursor/agents/sdd-{phase}.md
 *   - Claude Code: writes to ~/.claude/agents/sdd-{phase}.md
 *   - Kimi: writes to ~/.kimi/agents/sdd-{phase}.md
 *   - Kiro: writes to ~/.kiro/agents/sdd-{phase}.md
 *   - Qwen: writes to ~/.qwen/agents/sdd-{phase}.md
 */
export class SDDInstaller {
  private injector: FileInjector;

  constructor() {
    this.injector = new FileInjector();
  }

  /**
   * Installs SDD phase agent files into the agent's agents directory.
   * No-op if agentsDir is empty (solo-agent).
   */
  install(agentsDir: string, agents: SDDAgentFile[]): { injected: string[]; skipped: string[] } {
    const injected: string[] = [];
    const skipped: string[] = [];

    if (!agentsDir) {
      log.debug('No agentsDir configured for this agent (solo-agent). SDD runs inline.');
      return { injected, skipped };
    }

    fs.mkdirSync(agentsDir, { recursive: true });

    for (const agent of agents) {
      const filename = `${agent.phase}.md`;
      const targetPath = path.join(agentsDir, filename);

      try {
        const wasWritten = this.injector.writeFile(targetPath, agent.content);
        if (wasWritten) {
          injected.push(targetPath);
          log.debug(`Installed SDD agent: ${agent.phase} → ${targetPath}`);
        } else {
          skipped.push(targetPath);
        }
      } catch (err: any) {
        log.error(`Failed to install SDD agent ${agent.phase}: ${err.message}`);
        throw err;
      }
    }

    log.info(`SDD agents: ${injected.length} installed, ${skipped.length} unchanged in ${agentsDir}`);
    return { injected, skipped };
  }

  /**
   * Generates the default SDD agent content for a given phase.
   * This creates the frontmatter-based agent file that native agent systems read.
   */
  generateAgentContent(phase: SDDPhase, agentDescription: string, systemPrompt: string): string {
    return `---
name: ${phase}
description: "${agentDescription}"
readonly: ${phase === 'sdd-explore' || phase === 'sdd-verify' ? 'false' : 'true'}
---

${systemPrompt}
`.trim() + '\n';
  }

  /**
   * Removes SDD agent files from the agent's agents directory.
   * Only removes Ninja-installed files (matching SDD_PHASES names).
   */
  uninstall(agentsDir: string): string[] {
    const removed: string[] = [];

    if (!agentsDir || !fs.existsSync(agentsDir)) return removed;

    for (const phase of SDD_PHASES) {
      const filePath = path.join(agentsDir, `${phase}.md`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        removed.push(filePath);
        log.debug(`Removed SDD agent: ${filePath}`);
      }
    }

    log.info(`SDD agents removed: ${removed.length}`);
    return removed;
  }
}
