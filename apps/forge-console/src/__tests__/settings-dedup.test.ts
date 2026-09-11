import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  providerTypeOptions,
  providerDefaults,
  buildProviderFormDefaults,
} from '../../lib/settings';

const FORGE_CONSOLE_DIR = resolve(process.cwd(), 'apps', 'forge-console');

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  if (!statSync(dir, { throwIfNoEntry: false })) return files;
  for (const entry of readdirSync(dir)) {
    if (
      entry === 'node_modules' ||
      entry === '.next' ||
      entry === 'dist' ||
      entry === '.turbo' ||
      entry === '__tests__'
    ) {
      continue;
    }
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...collectSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
  }
  return files;
}

function toRepoRel(filePath: string): string {
  return relative(process.cwd(), filePath).split('\\').join('/');
}

describe('settings single source (T6.5b settings dedup)', () => {
  it('keeps the provider preset catalog complete and consistent', () => {
    const optionValues = providerTypeOptions.map((o) => o.value);
    expect(new Set(optionValues).size).toBe(optionValues.length);
    expect(optionValues).toContain('custom');
    for (const type of optionValues) {
      expect(providerDefaults[type]).toBeDefined();
    }
    expect(Object.keys(providerDefaults).sort()).toEqual([...optionValues].sort());
  });

  it('builds provider form defaults from a preset selection', () => {
    expect(buildProviderFormDefaults('ollama')).toEqual({
      name: 'Ollama (Local)',
      baseUrl: 'http://localhost:11434',
      models: 'llama2, codellama',
    });
    expect(buildProviderFormDefaults('custom')).toEqual({ name: '', baseUrl: '', models: '' });
  });

  it('gives every non-custom preset a real base URL', () => {
    for (const type of providerTypeOptions.map((o) => o.value)) {
      if (type === 'custom') continue;
      const baseUrl = buildProviderFormDefaults(type).baseUrl;
      expect(baseUrl.startsWith('http://') || baseUrl.startsWith('https://')).toBe(true);
    }
  });

  it('exposes /api/settings endpoints only through lib/api.ts (single backend boundary)', () => {
    const offenders = collectSourceFiles(FORGE_CONSOLE_DIR).filter((f) =>
      readFileSync(f, 'utf8').includes('/api/settings')
    );
    expect(offenders.map(toRepoRel)).toEqual(['apps/forge-console/lib/api.ts']);
  });

  it('has no remaining reference to the removed SettingsOverlay duplicate', () => {
    const offenders = collectSourceFiles(FORGE_CONSOLE_DIR).filter((f) =>
      readFileSync(f, 'utf8').includes('SettingsOverlay')
    );
    expect(offenders).toEqual([]);
  });
});
