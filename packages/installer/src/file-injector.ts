import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createLogger } from '@ninja/logging';

const log = createLogger('installer:file-injector');

// Ninja marker so we can identify our own injections for safe removal/update
const NINJA_MARKER_START = '<!-- ninja:managed:start -->';
const NINJA_MARKER_END = '<!-- ninja:managed:end -->';
const NINJA_TOML_MARKER_START = '# ninja:managed:start';
const NINJA_TOML_MARKER_END = '# ninja:managed:end';

/**
 * FileInjector — atomic file write operations with marker-based merging.
 * Mirrors Gentle AI's internal/components write helpers.
 *
 * Key behaviors:
 * - Creates parent directories automatically
 * - Uses a temp-file + rename pattern for atomic writes (no partial writes)
 * - Content hash comparison to skip unchanged files (efficient sync)
 * - Marker-based injection to merge into existing files without clobbering user content
 */
export class FileInjector {
  /**
   * Writes content to a file atomically.
   * If the file already has identical content, skips the write (returns false).
   * Returns true if the file was written, false if skipped.
   */
  writeFile(filePath: string, content: string): boolean {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    // Check if content is unchanged (skip re-write for efficient sync)
    if (fs.existsSync(filePath)) {
      try {
        const existing = fs.readFileSync(filePath, 'utf8');
        if (this.contentHash(existing) === this.contentHash(content)) {
          log.debug(`Skipping unchanged file: ${filePath}`);
          return false;
        }
      } catch (err: any) {
        log.warn(`Could not read existing file at ${filePath} for content check: ${err.message}. Writing anyway.`);
      }
    }

    // Atomic write: temp file → rename with retry mechanism
    const tmp = `${filePath}.ninja-tmp-${Date.now()}`;
    let attempts = 3;
    let delay = 100;
    while (attempts > 0) {
      try {
        fs.writeFileSync(tmp, content, 'utf8');
        fs.renameSync(tmp, filePath);
        log.debug(`Written: ${filePath}`);
        return true;
      } catch (err: any) {
        attempts--;
        if (attempts === 0) {
          // Cleanup temp file on final failure
          if (fs.existsSync(tmp)) {
            try { fs.unlinkSync(tmp); } catch {}
          }
          throw err;
        }
        log.warn(`File write failed for ${filePath} (${err.code}). Retrying in ${delay}ms...`);
        // Simple sync sleep
        const start = Date.now();
        while (Date.now() - start < delay) {}
        delay *= 2;
      }
    }
    return false;
  }

  /**
   * Injects a Ninja-managed block into a Markdown file.
   * If the file already has a ninja:managed block, replaces it.
   * If the file exists without a block, appends the block at the end.
   * If the file doesn't exist, creates it with the block.
   *
   * This is the key pattern for system prompt injection (CLAUDE.md, AGENTS.md, etc.)
   */
  injectManagedBlock(filePath: string, blockContent: string): boolean {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    const managedBlock = [
      NINJA_MARKER_START,
      blockContent.trim(),
      NINJA_MARKER_END,
    ].join('\n');

    if (!fs.existsSync(filePath)) {
      return this.writeFile(filePath, managedBlock + '\n');
    }

    const existing = fs.readFileSync(filePath, 'utf8');

    // Replace existing managed block
    if (existing.includes(NINJA_MARKER_START)) {
      const before = existing.slice(0, existing.indexOf(NINJA_MARKER_START));
      const afterMarker = existing.slice(existing.indexOf(NINJA_MARKER_END) + NINJA_MARKER_END.length);
      const newContent = before + managedBlock + afterMarker;
      return this.writeFile(filePath, newContent);
    }

    // Append managed block to existing user content
    const separator = existing.endsWith('\n') ? '' : '\n';
    return this.writeFile(filePath, existing + separator + '\n' + managedBlock + '\n');
  }

  /**
   * Injects a Ninja-managed block into a TOML file.
   * Uses `# ninja:managed` comments as markers.
   */
  injectManagedBlockToml(filePath: string, tomlContent: string): boolean {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    const managedBlock = [
      NINJA_TOML_MARKER_START,
      tomlContent.trim(),
      NINJA_TOML_MARKER_END,
    ].join('\n');

    if (!fs.existsSync(filePath)) {
      return this.writeFile(filePath, managedBlock + '\n');
    }

    const existing = fs.readFileSync(filePath, 'utf8');

    if (existing.includes(NINJA_TOML_MARKER_START)) {
      const before = existing.slice(0, existing.indexOf(NINJA_TOML_MARKER_START));
      const afterMarker = existing.slice(existing.indexOf(NINJA_TOML_MARKER_END) + NINJA_TOML_MARKER_END.length);
      const newContent = before + managedBlock + afterMarker;
      return this.writeFile(filePath, newContent);
    }

    const separator = existing.endsWith('\n') ? '' : '\n';
    return this.writeFile(filePath, existing + separator + '\n' + managedBlock + '\n');
  }

  /**
   * Merges a JSON object into an existing JSON file using a shallow merge.
   * Ninja-owned keys are tracked in a `__ninja__` metadata object.
   */
  mergeJson(filePath: string, ninjaKeys: Record<string, any>): boolean {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    let existing: Record<string, any> = {};

    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        existing = JSON.parse(this.stripComments(raw));
      } catch {
        log.warn(`Could not parse existing JSON at ${filePath}, starting fresh.`);
      }
    }

    const merged = { ...existing, ...ninjaKeys };
    return this.writeFile(filePath, JSON.stringify(merged, null, 2) + '\n');
  }

  /**
   * Removes the Ninja-managed block from a file.
   * Used during uninstall.
   */
  removeManagedBlock(filePath: string): boolean {
    if (!fs.existsSync(filePath)) return false;

    const content = fs.readFileSync(filePath, 'utf8');

    if (!content.includes(NINJA_MARKER_START)) return false;

    const before = content.slice(0, content.indexOf(NINJA_MARKER_START));
    const afterMarker = content.slice(content.indexOf(NINJA_MARKER_END) + NINJA_MARKER_END.length);
    const newContent = (before + afterMarker).trim();

    if (newContent.length === 0) {
      fs.unlinkSync(filePath);
    } else {
      this.writeFile(filePath, newContent + '\n');
    }

    return true;
  }

  /**
   * Removes a Ninja-owned key from a JSON file.
   */
  removeFromJson(filePath: string, keys: string[]): boolean {
    if (!fs.existsSync(filePath)) return false;

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const obj = JSON.parse(this.stripComments(raw));
      for (const key of keys) delete obj[key];
      return this.writeFile(filePath, JSON.stringify(obj, null, 2) + '\n');
    } catch {
      return false;
    }
  }

  private stripComments(jsonc: string): string {
    // Remove multi-line comments /* ... */ and single-line comments // ...
    return jsonc.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
  }

  private contentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
