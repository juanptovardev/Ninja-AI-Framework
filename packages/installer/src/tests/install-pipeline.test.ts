/**
 * install-pipeline.test.ts — Integration Tests for AgentInstaller Pipeline
 *
 * Turno 4 — Terminal A
 * Validates: install(), sync(), uninstall(), verify() pipeline behavior.
 *
 * Mock strategy: stable singleton spy objects returned by class constructors.
 * Vitest 4.x requires constructor mocks to use `function` (not arrow functions).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

// ── Module mocks (hoisted) ───────────────────────────────────────────────────

vi.mock('fs');
vi.mock('@ninja/roster');
vi.mock('@ninja/logging', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

// ── Stable singleton spy objects ─────────────────────────────────────────────
// Each class mock always returns the SAME object so we can assert on the spies.
// IMPORTANT: Vitest 4.x constructor mocks require `function` syntax, not arrows.

const backupSpy = {
  createBackup: vi.fn(),
  restore: vi.fn(),
  listBackups: vi.fn(),
  deleteBackup: vi.fn(),
};

const injectorSpy = {
  injectManagedBlock: vi.fn(),
  removeManagedBlock: vi.fn(),
};

const skillsSpy = {
  install: vi.fn(),
  uninstall: vi.fn(),
};

const sddSpy = {
  install: vi.fn(),
  uninstall: vi.fn(),
};

const mcpSpy = {
  install: vi.fn(),
};

const personaSpy = {
  install: vi.fn(),
  uninstall: vi.fn(),
};

// Class mocks using `function` (not arrow) syntax — required by Vitest 4.x for `new`.
vi.mock('../backup.js', () => ({
  // eslint-disable-next-line object-shorthand
  BackupManager: function BackupManager() { return backupSpy; },
}));

vi.mock('../file-injector.js', () => ({
  // eslint-disable-next-line object-shorthand
  FileInjector: function FileInjector() { return injectorSpy; },
}));

vi.mock('../skills-installer.js', () => ({
  // eslint-disable-next-line object-shorthand
  SkillsInstaller: function SkillsInstaller() { return skillsSpy; },
}));

vi.mock('../sdd-installer.js', () => ({
  // eslint-disable-next-line object-shorthand
  SDDInstaller: function SDDInstaller() { return sddSpy; },
}));

vi.mock('../mcp-installer.js', () => ({
  // eslint-disable-next-line object-shorthand
  MCPInstaller: function MCPInstaller() { return mcpSpy; },
}));

vi.mock('../persona-installer.js', () => ({
  // eslint-disable-next-line object-shorthand
  PersonaInstaller: function PersonaInstaller() { return personaSpy; },
}));

vi.mock('../content/index.js', () => ({
  getSystemPromptForAgent: vi.fn().mockReturnValue('# Ninja System Prompt\nContent here.'),
  getSDDAgentFiles: vi.fn().mockReturnValue([
    { phase: 'sdd-explore', content: '# Explore' },
    { phase: 'sdd-apply', content: '# Apply' },
  ]),
  getDefaultSkills: vi.fn().mockReturnValue([
    { id: 'sdd-orchestrator', filename: 'sdd-orchestrator.md', content: '# SDD' },
  ]),
  getDefaultPersona: vi.fn().mockReturnValue({
    id: 'ninja-default',
    name: 'Ninja Engineer',
    description: 'Default persona',
    tone: 'professional',
    expertise: ['TypeScript'],
    constraints: ['no any'],
  }),
}));

vi.mock('../arsenal-bridge.js', () => ({
  ArsenalBridge: {
    getInjectionSkills: vi.fn().mockReturnValue([
      { id: 'sdd-orchestrator', filename: 'sdd-orchestrator.md', content: '# SDD' },
    ]),
  },
}));

import fs from 'fs';
import * as roster from '@ninja/roster';
import { AgentInstaller } from '../agent-installer.js';
import type { ClientConfig } from '@ninja/roster';

// ── Config fixtures ──────────────────────────────────────────────────────────

const FAKE_HOME = '/fake/home';

const mockClaudeConfig: ClientConfig = {
  id: 'claude-code',
  name: 'Claude Code',
  type: 'cli',
  executablePath: '/usr/bin/claude',
  configPath: `${FAKE_HOME}/.claude/CLAUDE.md`,
  configDir: `${FAKE_HOME}/.claude`,
  mcpConfigPath: `${FAKE_HOME}/.claude.json`,
  skillsDir: `${FAKE_HOME}/.claude/commands`,
  agentsDir: '',
  status: 'connected',
  capabilities: [],
  assignedRole: 'orchestrator',
  delegationModel: 'full',
  connectionMethod: { type: 'headless-cli', command: 'claude', flags: [] },
  supportsAutoInstall: true,
  installCommand: 'npm install -g @anthropic/claude-code',
  installUrl: 'https://claude.ai/code',
};

const mockCursorConfig: ClientConfig = {
  id: 'cursor',
  name: 'Cursor IDE',
  type: 'gui',
  executablePath: '/usr/bin/cursor',
  configPath: `${FAKE_HOME}/.cursor/mcp.json`,
  configDir: `${FAKE_HOME}/.cursor`,
  mcpConfigPath: `${FAKE_HOME}/.cursor/mcp.json`,
  skillsDir: `${FAKE_HOME}/.cursor/skills`,
  agentsDir: `${FAKE_HOME}/.cursor/agents`,
  status: 'connected',
  capabilities: [],
  assignedRole: 'worker',
  delegationModel: 'full',
  connectionMethod: { type: 'headless-cli', command: 'cursor', flags: [] },
  supportsAutoInstall: false,
  installCommand: '',
  installUrl: 'https://cursor.sh',
};

const mockCodexConfig: ClientConfig = {
  id: 'codex',
  name: 'OpenAI Codex CLI',
  type: 'cli',
  executablePath: '/usr/bin/codex',
  configPath: `${FAKE_HOME}/.codex/config.toml`,
  configDir: `${FAKE_HOME}/.codex`,
  mcpConfigPath: `${FAKE_HOME}/.codex/config.toml`,
  skillsDir: `${FAKE_HOME}/.codex/skills`,
  agentsDir: '',
  status: 'connected',
  capabilities: [],
  assignedRole: 'worker',
  delegationModel: 'solo',
  connectionMethod: { type: 'headless-cli', command: 'codex', flags: [] },
  supportsAutoInstall: true,
  installCommand: 'npm install -g @openai/codex',
  installUrl: 'https://openai.com/codex',
};

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  // mockClear: resets call counts but does NOT touch the function implementations.
  // This is safe because our constructors are real functions (not vi.fn factories).
  backupSpy.createBackup.mockClear().mockResolvedValue({
    id: 'test-backup-id',
    agentId: 'claude-code',
    createdAt: '2026-06-05T00:00:00.000Z',
    backupPath: '/fake/.ninja/backups/test',
    files: ['CLAUDE.md'],
  });
  backupSpy.restore.mockClear().mockResolvedValue(undefined);
  backupSpy.listBackups.mockClear().mockReturnValue([]);
  backupSpy.deleteBackup.mockClear();

  injectorSpy.injectManagedBlock.mockClear().mockReturnValue(true);
  injectorSpy.removeManagedBlock.mockClear().mockReturnValue(true);

  skillsSpy.install.mockClear().mockReturnValue({ injected: ['skill1.md', 'skill2.md'], skipped: [] });
  skillsSpy.uninstall.mockClear().mockReturnValue(['skill1.md', 'skill2.md']);

  sddSpy.install.mockClear().mockReturnValue({ injected: ['sdd-explore.md'], skipped: [] });
  sddSpy.uninstall.mockClear().mockReturnValue(['sdd-explore.md']);

  mcpSpy.install.mockClear().mockReturnValue(true);

  personaSpy.install.mockClear().mockReturnValue({ written: true, path: '/fake/.claude/persona/ninja-persona.md' });
  personaSpy.uninstall.mockClear().mockReturnValue(['/fake/.claude/persona/ninja-persona.md']);

  // Reset roster mocks (vi.fn mocks, safe to mockReset)
  vi.mocked(roster.detectClient).mockReset();
  vi.mocked(roster.detectAllClients).mockReset();

  // Reset content/index.js mocks call counts
  const contentMod = await import('../content/index.js');
  vi.mocked(contentMod.getSystemPromptForAgent).mockClear().mockReturnValue('# Ninja System Prompt\nContent here.');
  vi.mocked(contentMod.getSDDAgentFiles).mockClear();
  vi.mocked(contentMod.getDefaultSkills).mockClear();
  vi.mocked(contentMod.getDefaultPersona).mockClear();

  // Default fs mock
  const mockFs = vi.mocked(fs);
  mockFs.existsSync = vi.fn(() => true);
  mockFs.readFileSync = vi.fn(() => '<!-- ninja:managed:start -->\nContent\n<!-- ninja:managed:end -->');
  mockFs.mkdirSync = vi.fn();
  mockFs.writeFileSync = vi.fn();
  mockFs.renameSync = vi.fn();
  mockFs.unlinkSync = vi.fn();
});

// ────────────────────────────────────────────────────────────────────────────
// INSTALL PIPELINE
// ────────────────────────────────────────────────────────────────────────────

describe('Install Pipeline', () => {
  it('install() returns success:true when agent is detected', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(mockClaudeConfig);

    const installer = new AgentInstaller();
    const result = await installer.install('claude-code');

    expect(result.success).toBe(true);
    expect(result.agentId).toBe('claude-code');
  });

  it('install() returns success:false with error when agent is not detected', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(undefined);

    const installer = new AgentInstaller();
    const result = await installer.install('claude-code');

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('not installed');
  });

  it('install() creates backup before injection when backup:true', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(mockClaudeConfig);

    const installer = new AgentInstaller();
    await installer.install('claude-code', { backup: true });

    expect(backupSpy.createBackup).toHaveBeenCalledWith(
      'claude-code',
      mockClaudeConfig.configDir,
      expect.any(String)
    );
  });

  it('install() skips backup when backup:false', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(mockClaudeConfig);

    const installer = new AgentInstaller();
    await installer.install('claude-code', { backup: false });

    expect(backupSpy.createBackup).not.toHaveBeenCalled();
  });

  it('install() calls getSystemPromptForAgent with correct agentId and delegation', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(mockClaudeConfig);
    const { getSystemPromptForAgent } = await import('../content/index.js');
    vi.mocked(getSystemPromptForAgent).mockReturnValue('# Test prompt');

    const installer = new AgentInstaller();
    await installer.install('claude-code');

    expect(vi.mocked(getSystemPromptForAgent)).toHaveBeenCalledWith('claude-code', 'full');
  });

  it('install() injects SDD agents for full-delegation agents (cursor)', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(mockCursorConfig);

    const installer = new AgentInstaller();
    const result = await installer.install('cursor');

    expect(result.success).toBe(true);
    expect(sddSpy.install).toHaveBeenCalled();
  });

  it('install() does NOT inject SDD agents for solo-delegation agents (codex)', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(mockCodexConfig);

    const installer = new AgentInstaller();
    await installer.install('codex');

    // Codex has empty agentsDir — SDDInstaller.install should not be called
    expect(sddSpy.install).not.toHaveBeenCalled();
  });

  it('install() populates result.injected and result.skipped arrays', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(mockClaudeConfig);

    const installer = new AgentInstaller();
    const result = await installer.install('claude-code');

    expect(Array.isArray(result.injected)).toBe(true);
    expect(Array.isArray(result.skipped)).toBe(true);
  });

  it('install() returns configDir from detected config', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(mockClaudeConfig);

    const installer = new AgentInstaller();
    const result = await installer.install('claude-code');

    expect(result.configDir).toBe(mockClaudeConfig.configDir);
  });

  it('install() attaches verify report when verify:true', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(mockClaudeConfig);

    const installer = new AgentInstaller();
    const result = await installer.install('claude-code', { verify: true });

    expect(result.verify).toBeDefined();
    expect(result.verify).toHaveProperty('agentId', 'claude-code');
  });

  it('install() rolls back via BackupManager.restore on injection failure', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(mockClaudeConfig);

    // Force injectManagedBlock to throw once
    injectorSpy.injectManagedBlock.mockImplementationOnce(() => {
      throw new Error('Simulated injection failure');
    });

    const installer = new AgentInstaller();
    const result = await installer.install('claude-code', { backup: true });

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(backupSpy.restore).toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// SYNC
// ────────────────────────────────────────────────────────────────────────────

describe('Sync', () => {
  it('sync() returns agentId in result', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(mockClaudeConfig);

    const installer = new AgentInstaller();
    const result = await installer.sync('claude-code');

    expect(result.agentId).toBe('claude-code');
  });

  it('sync() returns error when agent is not detected', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(undefined);

    const installer = new AgentInstaller();
    const result = await installer.sync('claude-code');

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('not installed');
  });

  it('sync() calls FileInjector.injectManagedBlock to update system prompt', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(mockClaudeConfig);

    const installer = new AgentInstaller();
    await installer.sync('claude-code');

    expect(injectorSpy.injectManagedBlock).toHaveBeenCalled();
  });

  it('sync() populates updated and unchanged arrays', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(mockClaudeConfig);

    const installer = new AgentInstaller();
    const result = await installer.sync('claude-code');

    expect(Array.isArray(result.updated)).toBe(true);
    expect(Array.isArray(result.unchanged)).toBe(true);
  });

  it('sync() uses custom systemPrompt from options instead of getSystemPromptForAgent', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(mockClaudeConfig);
    const { getSystemPromptForAgent } = await import('../content/index.js');
    vi.mocked(getSystemPromptForAgent).mockClear(); // reset counts from prior tests

    const installer = new AgentInstaller();
    await installer.sync('claude-code', { systemPrompt: 'Custom override prompt' });

    expect(vi.mocked(getSystemPromptForAgent)).not.toHaveBeenCalled();
  });

  it('sync() does not create backup (unlike install)', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(mockClaudeConfig);

    const installer = new AgentInstaller();
    await installer.sync('claude-code');

    expect(backupSpy.createBackup).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// UNINSTALL
// ────────────────────────────────────────────────────────────────────────────

describe('Uninstall', () => {
  it('uninstall() returns agentId and a non-empty removed array', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(mockClaudeConfig);

    const installer = new AgentInstaller();
    const result = await installer.uninstall('claude-code');

    expect(result.agentId).toBe('claude-code');
    expect(Array.isArray(result.removed)).toBe(true);
    expect(result.removed.length).toBeGreaterThan(0);
  });

  it('uninstall() calls FileInjector.removeManagedBlock for system prompt cleanup', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(mockClaudeConfig);

    const installer = new AgentInstaller();
    await installer.uninstall('claude-code');

    expect(injectorSpy.removeManagedBlock).toHaveBeenCalled();
  });

  it('uninstall() calls SkillsInstaller.uninstall to remove skill files', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(mockClaudeConfig);

    const installer = new AgentInstaller();
    await installer.uninstall('claude-code');

    expect(skillsSpy.uninstall).toHaveBeenCalled();
  });

  it('uninstall() calls PersonaInstaller.uninstall to remove persona file', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(mockClaudeConfig);

    const installer = new AgentInstaller();
    await installer.uninstall('claude-code');

    expect(personaSpy.uninstall).toHaveBeenCalled();
  });

  it('uninstall(restoreBackup=true) calls BackupManager.restore when backup exists', async () => {
    const backupManifest = {
      id: 'existing-backup',
      agentId: 'claude-code' as const,
      createdAt: '2026-06-04T00:00:00.000Z',
      backupPath: '/fake/.ninja/backups/existing',
      files: ['CLAUDE.md'],
    };

    backupSpy.listBackups.mockReturnValue([backupManifest]);
    vi.mocked(roster.detectClient).mockReturnValue(mockClaudeConfig);

    const installer = new AgentInstaller();
    const result = await installer.uninstall('claude-code', true);

    expect(backupSpy.restore).toHaveBeenCalled();
    expect(result.backupRestored).toBe(true);
  });

  it('uninstall() handles case when agent is not detected gracefully', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(undefined);

    const installer = new AgentInstaller();
    const result = await installer.uninstall('claude-code');

    expect(result.agentId).toBe('claude-code');
    expect(Array.isArray(result.removed)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// VERIFY
// ────────────────────────────────────────────────────────────────────────────

describe('Verify', () => {
  it('verify() returns passed:false when agent is not detected', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(undefined);

    const installer = new AgentInstaller();
    const report = await installer.verify('claude-code');

    expect(report.passed).toBe(false);
    expect(report.agentId).toBe('claude-code');
    expect(report.warnings.some(w => w.includes('not detected'))).toBe(true);
  });

  it('verify() returns passed:true when all required files are present', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(mockClaudeConfig);

    const promptFile = path.join(mockClaudeConfig.configDir, 'CLAUDE.md');
    const personaFile = path.join(mockClaudeConfig.configDir, 'persona', 'ninja-persona.md');

    vi.mocked(fs).existsSync = vi.fn((p) => {
      const s = String(p);
      return s === promptFile || s === personaFile || s === mockClaudeConfig.skillsDir;
    });
    vi.mocked(fs).readFileSync = vi.fn(() => '<!-- ninja:managed:start -->\nContent\n<!-- ninja:managed:end -->');

    const installer = new AgentInstaller();
    const report = await installer.verify('claude-code');

    expect(report.agentId).toBe('claude-code');
    expect(report.passed).toBe(true);
    expect(report.missing).toHaveLength(0);
  });

  it('verify() adds missing entry for persona file when absent', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(mockClaudeConfig);

    const promptFile = path.join(mockClaudeConfig.configDir, 'CLAUDE.md');
    vi.mocked(fs).existsSync = vi.fn((p) => String(p) === promptFile);
    vi.mocked(fs).readFileSync = vi.fn(() => '<!-- ninja:managed:start -->\n<!-- ninja:managed:end -->');

    const installer = new AgentInstaller();
    const report = await installer.verify('claude-code');

    const missingStr = report.missing.join(' ');
    expect(missingStr).toContain('ninja-persona.md');
  });

  it('verify() report has correct shape with agentId field', async () => {
    vi.mocked(roster.detectClient).mockReturnValue(mockClaudeConfig);
    vi.mocked(fs).existsSync = vi.fn(() => false);

    const installer = new AgentInstaller();
    const report = await installer.verify('claude-code');

    expect(report).toHaveProperty('agentId', 'claude-code');
    expect(report).toHaveProperty('passed');
    expect(report).toHaveProperty('present');
    expect(report).toHaveProperty('missing');
    expect(report).toHaveProperty('warnings');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// INSTALL ALL
// ────────────────────────────────────────────────────────────────────────────

describe('Install All', () => {
  it('installAll() processes all detected agents and returns results array', async () => {
    vi.mocked(roster.detectAllClients).mockReturnValue({
      'claude-code': mockClaudeConfig,
      cursor: mockCursorConfig,
    });
    vi.mocked(roster.detectClient).mockImplementation((id) => {
      if (id === 'claude-code') return mockClaudeConfig;
      if (id === 'cursor') return mockCursorConfig;
      return undefined;
    });

    const installer = new AgentInstaller();
    const results = await installer.installAll();

    expect(results).toHaveLength(2);
    expect(results.every(r => r.agentId)).toBe(true);
  });

  it('installAll() returns empty array when no agents detected', async () => {
    vi.mocked(roster.detectAllClients).mockReturnValue({});

    const installer = new AgentInstaller();
    const results = await installer.installAll();

    expect(results).toHaveLength(0);
  });

  it('installAll() continues and still returns results when one agent fails', async () => {
    vi.mocked(roster.detectAllClients).mockReturnValue({
      'claude-code': mockClaudeConfig,
      codex: mockCodexConfig,
    });
    vi.mocked(roster.detectClient)
      .mockReturnValueOnce(mockClaudeConfig)
      .mockReturnValueOnce(undefined); // codex not found

    const installer = new AgentInstaller();
    const results = await installer.installAll();

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
  });
});
