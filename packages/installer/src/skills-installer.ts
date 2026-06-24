import fs from 'fs';
import path from 'path';
import { createLogger } from '@ninja/logging';
import type { NinjaSkill } from './types.js';
import { FileInjector } from './file-injector.js';

const log = createLogger('installer:skills');

/**
 * SkillsInstaller — writes skill files to agent config directories.
 * Mirrors Gentle AI's internal/components/skills pipeline.
 *
 * Skills are written as individual .md files in the agent's skills directory.
 * Content hash comparison is used to skip unchanged files during sync.
 */
export class SkillsInstaller {
  private injector: FileInjector;

  constructor() {
    this.injector = new FileInjector();
  }

  /**
   * Installs all provided skills into the agent's skills directory.
   * Returns lists of injected and skipped file paths.
   */
  install(skillsDir: string, skills: NinjaSkill[]): { injected: string[]; skipped: string[] } {
    const injected: string[] = [];
    const skipped: string[] = [];

    if (!skillsDir) {
      log.debug('No skillsDir configured for this agent, skipping skills injection.');
      return { injected, skipped };
    }

    fs.mkdirSync(skillsDir, { recursive: true });

    for (const skill of skills) {
      const targetDir = skill.subfolder
        ? path.join(skillsDir, skill.subfolder)
        : skillsDir;

      const targetPath = path.join(targetDir, skill.filename);

      try {
        const wasWritten = this.injector.writeFile(targetPath, skill.content);
        if (wasWritten) {
          injected.push(targetPath);
          log.debug(`Installed skill: ${skill.id} → ${targetPath}`);
        } else {
          skipped.push(targetPath);
        }
      } catch (err: any) {
        log.error(`Failed to install skill ${skill.id}: ${err.message}`);
        throw err;
      }
    }

    log.info(`Skills: ${injected.length} installed, ${skipped.length} unchanged in ${skillsDir}`);
    return { injected, skipped };
  }

  /**
   * Removes Ninja-installed skills from the agent's skills directory.
   * Only removes files that match the provided skill list — won't touch user files.
   */
  uninstall(skillsDir: string, skills: NinjaSkill[]): string[] {
    const removed: string[] = [];

    if (!skillsDir || !fs.existsSync(skillsDir)) return removed;

    for (const skill of skills) {
      const targetDir = skill.subfolder ? path.join(skillsDir, skill.subfolder) : skillsDir;
      const targetPath = path.join(targetDir, skill.filename);

      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
        removed.push(targetPath);
        log.debug(`Removed skill: ${targetPath}`);
      }
    }

    log.info(`Skills removed: ${removed.length}`);
    return removed;
  }
}
