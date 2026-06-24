import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createLogger } from '@ninja/logging';
import type { NinjaPersona } from './types.js';

const log = createLogger('installer:persona-installer');

const NINJA_PERSONA_FILENAME = 'ninja-persona.md';

const NINJA_PERSONA_MARKER_START = '<!-- ninja:persona:managed:start -->';
const NINJA_PERSONA_MARKER_END = '<!-- ninja:persona:managed:end -->';

export class PersonaInstaller {
  install(personaDir: string, persona: NinjaPersona): { written: boolean; path: string } {
    fs.mkdirSync(personaDir, { recursive: true });

    const filePath = path.join(personaDir, NINJA_PERSONA_FILENAME);
    const content = this.generatePersonaContent(persona);

    if (fs.existsSync(filePath)) {
      const existing = fs.readFileSync(filePath, 'utf8');
      if (this.contentHash(existing) === this.contentHash(content)) {
        log.debug(`Skipping unchanged persona: ${filePath}`);
        return { written: false, path: filePath };
      }
    }

    this.atomicWrite(filePath, content);
    log.info(`Installed persona "${persona.id}" at ${filePath}`);
    return { written: true, path: filePath };
  }

  uninstall(personaDir: string): string[] {
    const filePath = path.join(personaDir, NINJA_PERSONA_FILENAME);
    const removed: string[] = [];

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      removed.push(filePath);
      log.info(`Removed persona file: ${filePath}`);
    }

    return removed;
  }

  private generatePersonaContent(persona: NinjaPersona): string {
    const expertiseLines = persona.expertise.map(e => `- ${e}`).join('\n');
    const constraintLines = persona.constraints.map(c => `- ${c}`).join('\n');

    return [
      `# Ninja Persona: ${persona.name}`,
      '',
      `## Tone: ${persona.tone}`,
      '',
      '## Expertise',
      expertiseLines,
      '',
      '## Constraints',
      constraintLines,
      '',
      '## Description',
      persona.description,
      '',
      '---',
      NINJA_PERSONA_MARKER_START,
      'This persona is managed by the Ninja AI Framework. Manual edits may be overwritten.',
      NINJA_PERSONA_MARKER_END,
      '',
    ].join('\n');
  }

  private atomicWrite(filePath: string, content: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.ninja-tmp-${Date.now()}`;
    try {
      fs.writeFileSync(tmp, content, 'utf8');
      fs.renameSync(tmp, filePath);
    } catch (err) {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      throw err;
    }
  }

  private contentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}