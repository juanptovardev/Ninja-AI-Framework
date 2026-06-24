import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { testDir, configPath } = vi.hoisted(() => {
  const os = require('node:os');
  const path = require('node:path');
  const dir = path.join(os.tmpdir(), `ninja-config-test-${Math.random().toString(36).slice(2)}`);
  return { testDir: dir, configPath: path.join(dir, 'config.json') };
});

vi.mock('./paths.js', () => {
  const path = require('node:path');
  return {
    getGlobalConfigPath: () => configPath,
    getNinjaGlobalDir: () => testDir,
    getNinjaWorkspaceDir: (wp: string) => path.join(wp, '.ninja'),
    getWorkspaceConfigPath: (wp: string) => path.join(wp, '.ninja', 'config.json'),
    getWorkspaceDbPath: (wp: string) => path.join(wp, '.ninja', 'workspace.db'),
    getWorkspaceRunsDir: (wp: string) => path.join(wp, '.ninja', 'runs'),
  };
});

import { loadGlobalConfig, loadWorkspaceConfig, resolveConfig } from './loader.js';
import * as paths from './paths.js';

describe('loadGlobalConfig', () => {
  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    try { fs.unlinkSync(configPath); } catch { /* ignore */ }
    vi.restoreAllMocks();
  });

  afterAll(() => {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('returns default config when no config file exists', () => {
    const config = loadGlobalConfig();
    expect(config.runtimePort).toBe(3141);
    expect(config.runtimeHost).toBe('127.0.0.1');
    expect(config.logLevel).toBe('info');
    expect(config.defaultWorkspacePath).toBe('');
  });

  it('merges partial config file with defaults', () => {
    fs.writeFileSync(configPath, JSON.stringify({ runtimePort: 9999 }), 'utf-8');

    const config = loadGlobalConfig();
    expect(config.runtimePort).toBe(9999);
    expect(config.runtimeHost).toBe('127.0.0.1');
    expect(config.logLevel).toBe('info');
  });

  it('returns defaults when config file contains invalid JSON', () => {
    fs.writeFileSync(configPath, '{ bad json', 'utf-8');

    const config = loadGlobalConfig();
    expect(config.runtimePort).toBe(3141);
    expect(config.runtimeHost).toBe('127.0.0.1');
  });

  it('overrides all default fields when full config provided', () => {
    const fullConfig = {
      runtimePort: 8080,
      runtimeHost: '0.0.0.0',
      logLevel: 'debug' as const,
      defaultWorkspacePath: '/projects/ninja',
    };
    fs.writeFileSync(configPath, JSON.stringify(fullConfig), 'utf-8');

    const config = loadGlobalConfig();
    expect(config).toEqual(fullConfig);
  });

  it('creates the global directory if it does not exist', () => {
    const freshDir = path.join(testDir, 'fresh-install');
    vi.spyOn(paths, 'getGlobalConfigPath').mockReturnValue(path.join(freshDir, 'config.json'));
    vi.spyOn(paths, 'getNinjaGlobalDir').mockReturnValue(freshDir);

    expect(fs.existsSync(freshDir)).toBe(false);

    const config = loadGlobalConfig();
    expect(fs.existsSync(freshDir)).toBe(true);
    expect(config.runtimePort).toBe(3141);
  });

  it('does not throw when config file is empty', () => {
    fs.writeFileSync(configPath, '', 'utf-8');

    expect(() => loadGlobalConfig()).not.toThrow();
  });
});

describe('loadWorkspaceConfig', () => {
  const workspacePath = path.join(testDir, 'my-workspace');
  const workspaceConfigPath = path.join(workspacePath, '.ninja', 'config.json');

  beforeEach(() => {
    fs.mkdirSync(workspacePath, { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(workspacePath, { recursive: true, force: true }); } catch { /* ignore */ }
    vi.restoreAllMocks();
  });

  it('returns null when no workspace config file exists', () => {
    const config = loadWorkspaceConfig(workspacePath);
    expect(config).toBeNull();
  });

  it('returns workspace config when file exists', () => {
    const workspaceData = { name: 'test-workspace', version: '1.0.0', description: 'A test workspace' };
    fs.mkdirSync(path.dirname(workspaceConfigPath), { recursive: true });
    fs.writeFileSync(workspaceConfigPath, JSON.stringify(workspaceData), 'utf-8');

    const config = loadWorkspaceConfig(workspacePath);
    expect(config).not.toBeNull();
    expect(config!.name).toBe('test-workspace');
    expect(config!.version).toBe('1.0.0');
    expect(config!.description).toBe('A test workspace');
  });

  it('returns null when workspace config contains invalid JSON', () => {
    fs.mkdirSync(path.dirname(workspaceConfigPath), { recursive: true });
    fs.writeFileSync(workspaceConfigPath, '{ invalid', 'utf-8');

    const config = loadWorkspaceConfig(workspacePath);
    expect(config).toBeNull();
  });

  it('creates the workspace .ninja directory if missing', () => {
    const workspaceDir = path.join(workspacePath, '.ninja');
    expect(fs.existsSync(workspaceDir)).toBe(false);

    loadWorkspaceConfig(workspacePath);

    expect(fs.existsSync(workspaceDir)).toBe(true);
  });

  it('workspace config with optional runtimePort and logLevel', () => {
    const workspaceData = {
      name: 'custom',
      version: '2.0.0',
      runtimePort: 8080,
      logLevel: 'debug' as const,
    };
    fs.mkdirSync(path.dirname(workspaceConfigPath), { recursive: true });
    fs.writeFileSync(workspaceConfigPath, JSON.stringify(workspaceData), 'utf-8');

    const config = loadWorkspaceConfig(workspacePath);
    expect(config!.runtimePort).toBe(8080);
    expect(config!.logLevel).toBe('debug');
  });
});

describe('resolveConfig', () => {
  const workspacePath = path.join(testDir, 'resolve-workspace');
  const workspaceConfigPath = path.join(workspacePath, '.ninja', 'config.json');

  beforeAll(() => {
    fs.mkdirSync(path.dirname(workspaceConfigPath), { recursive: true });
    const workspaceData = { name: 'resolve-test', version: '1.0.0', runtimePort: 8080, logLevel: 'debug' as const };
    fs.writeFileSync(workspaceConfigPath, JSON.stringify(workspaceData), 'utf-8');
  });

  afterAll(() => {
    try { fs.rmSync(workspacePath, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('resolves config without workspace using global defaults', () => {
    const resolved = resolveConfig();
    expect(resolved.runtime.port).toBe(3141);
    expect(resolved.runtime.host).toBe('127.0.0.1');
    expect(resolved.runtime.logLevel).toBe('info');
    expect(resolved.workspace).toBeNull();
    expect(resolved.workspacePath).toBeNull();
  });

  it('resolves config with workspace applying overrides', () => {
    const resolved = resolveConfig(workspacePath);
    expect(resolved.runtime.port).toBe(8080);
    expect(resolved.runtime.host).toBe('127.0.0.1');
    expect(resolved.runtime.logLevel).toBe('debug');
    expect(resolved.workspace).not.toBeNull();
    expect(resolved.workspace!.name).toBe('resolve-test');
    expect(resolved.workspacePath).toBe(workspacePath);
  });

  it('global config is available in resolved config', () => {
    const resolved = resolveConfig(workspacePath);
    expect(resolved.global.runtimePort).toBe(3141);
    expect(resolved.global.runtimeHost).toBe('127.0.0.1');
  });
});