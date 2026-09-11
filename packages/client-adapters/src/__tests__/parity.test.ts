/**
 * parity.test.ts — Feature Parity Test Suite
 *
 * Turno 4 — Terminal A
 * Validates: Binary Detection, Config Dir Resolution, Delegation Model,
 * System Prompt Injection, Skills Injection, SDD Agent Injection,
 * MCP Config Injection, Persona Injection, Verification
 *
 * Uses vi.mock('fs') and vi.mock('child_process') for full filesystem isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import os from 'os';

// ── Filesystem & process mocks (must be before adapter imports) ─────────────

vi.mock('fs');
vi.mock('child_process');
vi.mock('@ninja/logging', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

import fs from 'fs';
import { execSync } from 'child_process';
import { ClaudeAdapter } from '../adapters/claude-adapter.js';
import { CodexAdapter } from '../adapters/codex-adapter.js';
import { CursorAdapter } from '../adapters/cursor-adapter.js';
import { OpenCodeAdapter } from '../adapters/opencode-adapter.js';
import { WindsurfAdapter } from '../adapters/windsurf-adapter.js';
import { GeminiCliAdapter } from '../adapters/gemini-cli-adapter.js';
import { KimiAdapter } from '../adapters/kimi-adapter.js';
import { KiroAdapter } from '../adapters/kiro-adapter.js';
import { QwenAdapter } from '../adapters/qwen-adapter.js';
import { GenericAgentAdapter, PRESET_AGENTS } from '../adapters/generic-agents-adapter.js';
import type { NinjaSkill, SDDAgentFile, MCPServerConfig } from '../types.js';

// ── Test-wide constants ─────────────────────────────────────────────────────

const FAKE_HOME = path.join('fake', 'home');
const MARKER_START = '<!-- ninja:managed:start -->';
const MARKER_END = '<!-- ninja:managed:end -->';
const NINJA_MARKER_START = '# NINJA-MANAGED-START';
const NINJA_MARKER_END = '# NINJA-MANAGED-END';

const mockFs = vi.mocked(fs);
const mockExecSync = vi.mocked(execSync);

// Helper: reset and configure fs mock state
function setupFsMock(
  options: {
    exists?: Record<string, boolean>;
    contents?: Record<string, string>;
  } = {}
) {
  mockFs.existsSync = vi.fn((p: fs.PathLike) => {
    const key = String(p);
    // Normalize slashes for comparison
    const normKey = key.replace(/\\/g, '/');
    if (options.exists) {
      for (const [pattern, val] of Object.entries(options.exists)) {
        const normPattern = pattern.replace(/\\/g, '/');
        if (normKey === normPattern || normKey.includes(normPattern)) return val;
      }
    }
    return false;
  });

  mockFs.readFileSync = vi.fn((p: fs.PathLike | number, _opts?: any): any => {
    const key = String(p);
    const normKey = key.replace(/\\/g, '/');
    if (options.contents) {
      for (const [pattern, val] of Object.entries(options.contents)) {
        const normPattern = pattern.replace(/\\/g, '/');
        if (normKey === normPattern || normKey.includes(normPattern)) return val;
      }
    }
    return '';
  });

  mockFs.mkdirSync = vi.fn();
  mockFs.writeFileSync = vi.fn();
  mockFs.renameSync = vi.fn();
  mockFs.unlinkSync = vi.fn();
}

// ── Adapter instantiation matrix ────────────────────────────────────────────

const allAdapters = [
  {
    name: 'ClaudeAdapter',
    create: () => new ClaudeAdapter(),
    agentId: 'claude-code',
    delegation: 'full',
    binary: 'claude',
  },
  {
    name: 'CodexAdapter',
    create: () => new CodexAdapter(),
    agentId: 'codex',
    delegation: 'solo',
    binary: 'codex',
  },
  {
    name: 'CursorAdapter',
    create: () => new CursorAdapter(),
    agentId: 'cursor',
    delegation: 'full',
    binary: 'cursor',
  },
  {
    name: 'OpenCodeAdapter',
    create: () => new OpenCodeAdapter(),
    agentId: 'opencode',
    delegation: 'full',
    binary: 'opencode',
  },
  {
    name: 'WindsurfAdapter',
    create: () => new WindsurfAdapter(),
    agentId: 'windsurf',
    delegation: 'solo',
    binary: 'windsurf',
  },
  {
    name: 'GeminiCliAdapter',
    create: () => new GeminiCliAdapter(),
    agentId: 'gemini-cli',
    delegation: 'full',
    binary: 'gemini',
  },
  {
    name: 'KimiAdapter',
    create: () => new KimiAdapter(),
    agentId: 'kimi-code',
    delegation: 'full',
    binary: 'kimi',
  },
  {
    name: 'KiroAdapter',
    create: () => new KiroAdapter(),
    agentId: 'kiro-ide',
    delegation: 'full',
    binary: 'kiro',
  },
  {
    name: 'QwenAdapter',
    create: () => new QwenAdapter(),
    agentId: 'qwen-code',
    delegation: 'full',
    binary: 'qwen',
  },
  {
    name: 'GenericAgentAdapter (Trae)',
    create: () => new GenericAgentAdapter(PRESET_AGENTS.trae),
    agentId: 'trae',
    delegation: 'solo',
    binary: 'trae',
  },
];

// ── Fixture data ─────────────────────────────────────────────────────────────

const mockSkills: NinjaSkill[] = [
  { id: 'sdd-orchestrator', filename: 'sdd-orchestrator.md', content: '# SDD Orchestrator' },
  { id: 'engram-protocol', filename: 'engram-protocol.md', content: '# Engram Protocol' },
];

const mockSddAgents: SDDAgentFile[] = [
  { phase: 'sdd-explore', content: '# SDD Explore\nExplore the codebase.' },
  { phase: 'sdd-apply', content: '# SDD Apply\nApply the changes.' },
];

const mockMcpServers: MCPServerConfig[] = [
  {
    name: 'ninja-kage',
    command: 'node',
    args: ['/fake/home/.ninja/mcp-bridge.js'],
    env: { NINJA_RUNTIME_URL: 'http://localhost:3141' },
  },
];

// ────────────────────────────────────────────────────────────────────────────
// 1. BINARY DETECTION
// ────────────────────────────────────────────────────────────────────────────

describe('Binary Detection', () => {
  beforeEach(() => {
    setupFsMock({ exists: {} });
  });

  it.each(allAdapters)(
    '$name — returns DetectionResult with installed:true when binary found in PATH',
    async ({ create, binary }) => {
      mockExecSync.mockReturnValue(`/usr/bin/${binary}\n`);

      const adapter = create();
      const result = await adapter.detect(FAKE_HOME);

      expect(result).toMatchObject({
        installed: true,
        binaryPath: expect.any(String),
        configDir: expect.any(String),
        configFound: expect.any(Boolean),
      });
      expect(result.binaryPath).toBeTruthy();
    }
  );

  it.each(allAdapters)(
    '$name — returns installed:false when binary not in PATH',
    async ({ create }) => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not found');
      });

      const adapter = create();
      const result = await adapter.detect(FAKE_HOME);

      expect(result.installed).toBe(false);
      expect(result.binaryPath).toBe('');
    }
  );

  it.each(allAdapters)(
    '$name — detect() does NOT throw when agent is not installed',
    async ({ create }) => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not found');
      });
      mockFs.existsSync = vi.fn(() => false);

      const adapter = create();
      await expect(adapter.detect(FAKE_HOME)).resolves.not.toThrow();
    }
  );

  it.each(allAdapters)(
    '$name — configFound:true when configDir exists on disk',
    async ({ create }) => {
      mockExecSync.mockReturnValue('/usr/bin/agent\n');
      const adapter = create();
      const configDir = adapter.globalConfigDir(FAKE_HOME);
      mockFs.existsSync = vi.fn((p) => String(p) === configDir);

      const result = await adapter.detect(FAKE_HOME);
      expect(result.configFound).toBe(true);
    }
  );
});

// ────────────────────────────────────────────────────────────────────────────
// 2. CONFIG DIR RESOLUTION
// ────────────────────────────────────────────────────────────────────────────

describe('Config Dir Resolution', () => {
  it('ClaudeAdapter — globalConfigDir returns ~/.claude', () => {
    const adapter = new ClaudeAdapter();
    expect(adapter.globalConfigDir(FAKE_HOME)).toBe(path.join(FAKE_HOME, '.claude'));
  });

  it('ClaudeAdapter — skillsDir returns ~/.claude/commands', () => {
    const adapter = new ClaudeAdapter();
    expect(adapter.skillsDir(FAKE_HOME)).toBe(path.join(FAKE_HOME, '.claude', 'commands'));
  });

  it('ClaudeAdapter — agentsDir returns empty string (uses Task tool)', () => {
    const adapter = new ClaudeAdapter();
    expect(adapter.agentsDir(FAKE_HOME)).toBe('');
  });

  it('ClaudeAdapter — mcpConfigPath returns ~/.claude.json', () => {
    const adapter = new ClaudeAdapter();
    expect(adapter.mcpConfigPath(FAKE_HOME)).toBe(path.join(FAKE_HOME, '.claude.json'));
  });

  it('CodexAdapter — globalConfigDir returns ~/.codex', () => {
    const adapter = new CodexAdapter();
    expect(adapter.globalConfigDir(FAKE_HOME)).toBe(path.join(FAKE_HOME, '.codex'));
  });

  it('CodexAdapter — skillsDir returns ~/.codex/skills', () => {
    const adapter = new CodexAdapter();
    expect(adapter.skillsDir(FAKE_HOME)).toBe(path.join(FAKE_HOME, '.codex', 'skills'));
  });

  it('CodexAdapter — agentsDir returns empty string (solo delegation)', () => {
    const adapter = new CodexAdapter();
    expect(adapter.agentsDir()).toBe('');
  });

  it('CodexAdapter — mcpConfigPath returns ~/.codex/config.toml', () => {
    const adapter = new CodexAdapter();
    expect(adapter.mcpConfigPath(FAKE_HOME)).toBe(path.join(FAKE_HOME, '.codex', 'config.toml'));
  });

  it('CursorAdapter — globalConfigDir returns ~/.cursor', () => {
    const adapter = new CursorAdapter();
    expect(adapter.globalConfigDir(FAKE_HOME)).toBe(path.join(FAKE_HOME, '.cursor'));
  });

  it('CursorAdapter — skillsDir returns ~/.cursor/skills', () => {
    const adapter = new CursorAdapter();
    expect(adapter.skillsDir(FAKE_HOME)).toBe(path.join(FAKE_HOME, '.cursor', 'skills'));
  });

  it('CursorAdapter — agentsDir returns ~/.cursor/agents', () => {
    const adapter = new CursorAdapter();
    expect(adapter.agentsDir(FAKE_HOME)).toBe(path.join(FAKE_HOME, '.cursor', 'agents'));
  });

  it('CursorAdapter — mcpConfigPath returns ~/.cursor/mcp.json', () => {
    const adapter = new CursorAdapter();
    expect(adapter.mcpConfigPath(FAKE_HOME)).toBe(path.join(FAKE_HOME, '.cursor', 'mcp.json'));
  });

  it('OpenCodeAdapter — globalConfigDir returns platform config home / opencode', () => {
    const adapter = new OpenCodeAdapter();
    const resolved = adapter.globalConfigDir(FAKE_HOME);
    expect(resolved).toContain('opencode');
  });

  it('WindsurfAdapter — globalConfigDir returns ~/.codeium/windsurf', () => {
    const adapter = new WindsurfAdapter();
    expect(adapter.globalConfigDir(FAKE_HOME)).toBe(path.join(FAKE_HOME, '.codeium', 'windsurf'));
  });

  it('GeminiCliAdapter — globalConfigDir returns ~/.gemini', () => {
    const adapter = new GeminiCliAdapter();
    expect(adapter.globalConfigDir(FAKE_HOME)).toBe(path.join(FAKE_HOME, '.gemini'));
  });

  it('GenericAgentAdapter — returns configured config dir path', () => {
    const adapter = new GenericAgentAdapter(PRESET_AGENTS.trae);
    expect(adapter.globalConfigDir(FAKE_HOME)).toBe(path.join(FAKE_HOME, '.trae'));
  });

  it.each(allAdapters)('$name — paths use provided homeDir parameter', ({ create, agentId }) => {
    const adapter = create();
    const customHome = path.join('C:', 'custom', 'home', 'dir');

    const oldAppData = process.env.APPDATA;
    if (agentId === 'opencode') {
      delete process.env.APPDATA;
    }
    try {
      const configDir = adapter.globalConfigDir(customHome);
      expect(configDir).toContain(customHome);
    } finally {
      if (agentId === 'opencode') {
        process.env.APPDATA = oldAppData;
      }
    }
  });

  it.each(allAdapters)('$name — globalConfigDir never returns empty string', ({ create }) => {
    const adapter = create();
    expect(adapter.globalConfigDir(FAKE_HOME)).toBeTruthy();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. DELEGATION MODEL
// ────────────────────────────────────────────────────────────────────────────

describe('Delegation Model', () => {
  it('ClaudeAdapter — delegation is full', () => {
    expect(new ClaudeAdapter().delegationModel()).toBe('full');
  });

  it('CodexAdapter — delegation is solo', () => {
    expect(new CodexAdapter().delegationModel()).toBe('solo');
  });

  it('CursorAdapter — delegation is full', () => {
    expect(new CursorAdapter().delegationModel()).toBe('full');
  });

  it('OpenCodeAdapter — delegation is full', () => {
    expect(new OpenCodeAdapter().delegationModel()).toBe('full');
  });

  it('WindsurfAdapter — delegation is solo', () => {
    expect(new WindsurfAdapter().delegationModel()).toBe('solo');
  });

  it('GeminiCliAdapter — delegation is full', () => {
    expect(new GeminiCliAdapter().delegationModel()).toBe('full');
  });

  it.each(allAdapters)(
    '$name — delegationModel() returns full, solo, or package-managed',
    ({ create }) => {
      const model = create().delegationModel();
      expect(['full', 'solo', 'package-managed']).toContain(model);
    }
  );
});

// ────────────────────────────────────────────────────────────────────────────
// 4. SYSTEM PROMPT INJECTION
// ────────────────────────────────────────────────────────────────────────────

describe('System Prompt Injection', () => {
  beforeEach(() => {
    setupFsMock({ exists: { [FAKE_HOME]: false } });
  });

  it('ClaudeAdapter — injectSystemPrompt creates CLAUDE.md with ninja markers when file does not exist', async () => {
    mockFs.existsSync = vi.fn(() => false);

    const adapter = new ClaudeAdapter();
    const configDir = path.join(FAKE_HOME, '.claude');
    await adapter.injectSystemPrompt(configDir, 'Test system prompt content');

    expect(mockFs.writeFileSync).toHaveBeenCalled();
    const writtenContent = vi.mocked(mockFs.writeFileSync).mock.calls[0]?.[1] as string;
    expect(writtenContent).toContain(MARKER_START);
    expect(writtenContent).toContain('Test system prompt content');
    expect(writtenContent).toContain(MARKER_END);
  });

  it('ClaudeAdapter — injectSystemPrompt merges block when CLAUDE.md already exists with markers', async () => {
    const existingContent = `# Existing User Content\n\n${MARKER_START}\nOLD NINJA CONTENT\n${MARKER_END}\n`;
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() => existingContent) as unknown as typeof mockFs.readFileSync;

    const adapter = new ClaudeAdapter();
    const configDir = path.join(FAKE_HOME, '.claude');
    await adapter.injectSystemPrompt(configDir, 'NEW NINJA CONTENT');

    expect(mockFs.writeFileSync).toHaveBeenCalled();
    const writtenContent = vi.mocked(mockFs.writeFileSync).mock.calls[0]?.[1] as string;
    expect(writtenContent).toContain('NEW NINJA CONTENT');
    expect(writtenContent).not.toContain('OLD NINJA CONTENT');
    expect(writtenContent).toContain('# Existing User Content');
  });

  it('CodexAdapter — injectSystemPrompt writes to instructions.md', async () => {
    mockFs.existsSync = vi.fn(() => false);

    const adapter = new CodexAdapter();
    const configDir = path.join(FAKE_HOME, '.codex');
    await adapter.injectSystemPrompt(configDir, 'Codex instructions');

    expect(mockFs.writeFileSync).toHaveBeenCalled();
    const writtenPath = String(vi.mocked(mockFs.writeFileSync).mock.calls[0]?.[0]);
    expect(writtenPath).toContain('instructions.md');
  });

  it('CursorAdapter — injectSystemPrompt writes to rules/ninja-orchestrator.mdc with MDC frontmatter', async () => {
    mockFs.existsSync = vi.fn(() => false);

    const adapter = new CursorAdapter();
    await adapter.injectSystemPrompt(path.join(FAKE_HOME, '.cursor'), 'Cursor MDC content');

    expect(mockFs.writeFileSync).toHaveBeenCalled();
    const writtenPath = String(vi.mocked(mockFs.writeFileSync).mock.calls[0]?.[0]);
    expect(writtenPath).toContain('ninja-orchestrator.mdc');

    const written = vi.mocked(mockFs.writeFileSync).mock.calls[0]?.[1] as string;
    expect(written).toContain('---');
    expect(written).toContain('description:');
  });

  it('OpenCodeAdapter — injectSystemPrompt writes systemPrompt field to opencode.json', async () => {
    mockFs.existsSync = vi.fn(() => false);

    const adapter = new OpenCodeAdapter();
    const configDir = path.join(FAKE_HOME, 'opencode');
    await adapter.injectSystemPrompt(configDir, 'OpenCode system prompt');

    expect(mockFs.writeFileSync).toHaveBeenCalled();
    const written = vi.mocked(mockFs.writeFileSync).mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(written);
    expect(parsed.systemPrompt).toBe('OpenCode system prompt');
  });

  it('WindsurfAdapter — injectSystemPrompt writes to memories/ninja-orchestrator.md with custom markers', async () => {
    mockFs.existsSync = vi.fn(() => false);

    const adapter = new WindsurfAdapter();
    const configDir = path.join(FAKE_HOME, '.codeium', 'windsurf');
    await adapter.injectSystemPrompt(configDir, 'Windsurf prompt');

    expect(mockFs.writeFileSync).toHaveBeenCalled();
    const writtenPath = String(vi.mocked(mockFs.writeFileSync).mock.calls[0]?.[0]);
    expect(writtenPath).toContain('ninja-orchestrator.md');

    const written = vi.mocked(mockFs.writeFileSync).mock.calls[0]?.[1] as string;
    expect(written).toContain(NINJA_MARKER_START);
    expect(written).toContain('Windsurf prompt');
    expect(written).toContain(NINJA_MARKER_END);
  });

  it('GeminiCliAdapter — injectSystemPrompt writes to GEMINI.md with custom markers', async () => {
    mockFs.existsSync = vi.fn(() => false);

    const adapter = new GeminiCliAdapter();
    const configDir = path.join(FAKE_HOME, '.gemini');
    await adapter.injectSystemPrompt(configDir, 'Gemini prompt');

    expect(mockFs.writeFileSync).toHaveBeenCalled();
    const writtenPath = String(vi.mocked(mockFs.writeFileSync).mock.calls[0]?.[0]);
    expect(writtenPath).toContain('GEMINI.md');

    const written = vi.mocked(mockFs.writeFileSync).mock.calls[0]?.[1] as string;
    expect(written).toContain(NINJA_MARKER_START);
    expect(written).toContain('Gemini prompt');
    expect(written).toContain(NINJA_MARKER_END);
  });

  it('GenericAgentAdapter — injectSystemPrompt writes to configured file path', async () => {
    mockFs.existsSync = vi.fn(() => false);

    const adapter = new GenericAgentAdapter(PRESET_AGENTS.trae);
    const configDir = path.join(FAKE_HOME, '.trae');
    await adapter.injectSystemPrompt(configDir, 'Trae prompt');

    expect(mockFs.writeFileSync).toHaveBeenCalled();
    const writtenPath = String(vi.mocked(mockFs.writeFileSync).mock.calls[0]?.[0]);
    expect(writtenPath).toContain('system-prompt.md');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. SKILLS INJECTION
// ────────────────────────────────────────────────────────────────────────────

describe('Skills Injection', () => {
  beforeEach(() => {
    setupFsMock({});
    mockFs.existsSync = vi.fn(() => false);
  });

  it('ClaudeAdapter — injectSkills creates skills directory if it does not exist', async () => {
    const adapter = new ClaudeAdapter();
    await adapter.injectSkills(path.join(FAKE_HOME, '.claude'), mockSkills);

    expect(mockFs.mkdirSync).toHaveBeenCalled();
  });

  it('ClaudeAdapter — injectSkills writes each skill as .md file in commands/', async () => {
    const adapter = new ClaudeAdapter();
    await adapter.injectSkills(path.join(FAKE_HOME, '.claude'), mockSkills);

    const renameCalls = vi.mocked(mockFs.renameSync).mock.calls;
    const writeCalls = vi.mocked(mockFs.writeFileSync).mock.calls;

    const allPaths = [
      ...renameCalls.map((c) => String(c[1])),
      ...writeCalls.map((c) => String(c[0])),
    ];

    expect(allPaths.some((p) => p.includes('sdd-orchestrator'))).toBe(true);
    expect(allPaths.some((p) => p.includes('engram-protocol'))).toBe(true);
  });

  it('ClaudeAdapter — injectSkills skips unchanged files (content hash match)', async () => {
    const skillContent = '# SDD Orchestrator';
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() => skillContent) as unknown as typeof mockFs.readFileSync;

    const adapter = new ClaudeAdapter();
    const unchangedSkill: NinjaSkill[] = [
      { id: 'sdd-orchestrator', filename: 'sdd-orchestrator.md', content: skillContent },
    ];
    await adapter.injectSkills(path.join(FAKE_HOME, '.claude'), unchangedSkill);

    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });

  it('WindsurfAdapter — injectSkills writes wrapped skills to skills/', async () => {
    const adapter = new WindsurfAdapter();
    await adapter.injectSkills(path.join(FAKE_HOME, '.codeium', 'windsurf'), mockSkills);

    expect(mockFs.writeFileSync).toHaveBeenCalled();
    const written = vi.mocked(mockFs.writeFileSync).mock.calls[0]?.[1] as string;
    expect(written).toContain(NINJA_MARKER_START);
    expect(written).toContain('# SDD Orchestrator');
  });

  it('GenericAgentAdapter — injectSkills skips when skillsSubdir is null', async () => {
    const customConfig = { ...PRESET_AGENTS.trae, skillsSubdir: null };
    const adapter = new GenericAgentAdapter(customConfig);
    await adapter.injectSkills(path.join(FAKE_HOME, '.trae'), mockSkills);

    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. SDD AGENT INJECTION
// ────────────────────────────────────────────────────────────────────────────

describe('SDD Agent Injection', () => {
  beforeEach(() => {
    setupFsMock({});
    mockFs.existsSync = vi.fn(() => false);
  });

  it('CursorAdapter (full delegation) — injectSDD writes sdd-*.md files in agents/', async () => {
    const adapter = new CursorAdapter();
    await adapter.injectSDD(path.join(FAKE_HOME, '.cursor'), mockSddAgents);

    expect(mockFs.writeFileSync).toHaveBeenCalled();
    const paths = vi.mocked(mockFs.writeFileSync).mock.calls.map((c) => String(c[0]));
    expect(paths.some((p) => p.includes('sdd-explore.md'))).toBe(true);
    expect(paths.some((p) => p.includes('sdd-apply.md'))).toBe(true);
  });

  it('OpenCodeAdapter — injectSDD writes agent files in agents/', async () => {
    const adapter = new OpenCodeAdapter();
    await adapter.injectSDD(path.join(FAKE_HOME, 'opencode'), mockSddAgents);

    expect(mockFs.writeFileSync).toHaveBeenCalled();
    const paths = vi.mocked(mockFs.writeFileSync).mock.calls.map((c) => String(c[0]));
    expect(paths.some((p) => p.includes('sdd-explore.md'))).toBe(true);
  });

  it('GeminiCliAdapter — injectSDD writes wrapped agent files in agents/', async () => {
    const adapter = new GeminiCliAdapter();
    await adapter.injectSDD(path.join(FAKE_HOME, '.gemini'), mockSddAgents);

    expect(mockFs.writeFileSync).toHaveBeenCalled();
    const written = vi.mocked(mockFs.writeFileSync).mock.calls[0]?.[1] as string;
    expect(written).toContain(NINJA_MARKER_START);
    expect(written).toContain('# SDD Explore');
  });

  it('WindsurfAdapter (solo delegation) — injectSDD is a no-op', async () => {
    const adapter = new WindsurfAdapter();
    await adapter.injectSDD(path.join(FAKE_HOME, '.codeium', 'windsurf'), mockSddAgents);

    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 7. MCP CONFIG INJECTION
// ────────────────────────────────────────────────────────────────────────────

describe('MCP Config Injection', () => {
  beforeEach(() => {
    setupFsMock({});
    mockFs.existsSync = vi.fn(() => false);
  });

  it('ClaudeAdapter — injectMCPConfig writes mcpServers to .claude.json (JSON format)', async () => {
    const adapter = new ClaudeAdapter();
    await adapter.injectMCPConfig(path.join(FAKE_HOME, '.claude'), mockMcpServers);

    expect(mockFs.writeFileSync).toHaveBeenCalled();
    const written = vi.mocked(mockFs.writeFileSync).mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(written);
    expect(parsed).toHaveProperty('mcpServers');
    expect(parsed.mcpServers).toHaveProperty('ninja-kage');
  });

  it('OpenCodeAdapter — injectMCPConfig writes to opencode.json', async () => {
    const adapter = new OpenCodeAdapter();
    await adapter.injectMCPConfig(path.join(FAKE_HOME, 'opencode'), mockMcpServers);

    expect(mockFs.writeFileSync).toHaveBeenCalled();
    const written = vi.mocked(mockFs.writeFileSync).mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(written);
    expect(parsed.mcpServers).toHaveProperty('ninja-kage');
  });

  it('WindsurfAdapter — injectMCPConfig writes to mcp_config.json as JSON array', async () => {
    const adapter = new WindsurfAdapter();
    await adapter.injectMCPConfig(path.join(FAKE_HOME, '.codeium', 'windsurf'), mockMcpServers);

    expect(mockFs.writeFileSync).toHaveBeenCalled();
    const written = vi.mocked(mockFs.writeFileSync).mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(written);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].name).toBe('ninja-kage');
  });

  it('GeminiCliAdapter — injectMCPConfig writes to settings.json', async () => {
    const adapter = new GeminiCliAdapter();
    await adapter.injectMCPConfig(path.join(FAKE_HOME, '.gemini'), mockMcpServers);

    expect(mockFs.writeFileSync).toHaveBeenCalled();
    const written = vi.mocked(mockFs.writeFileSync).mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(written);
    expect(parsed.mcpServers).toHaveProperty('ninja-kage');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 8. PERSONA INJECTION
// ────────────────────────────────────────────────────────────────────────────

describe('Persona Injection', () => {
  beforeEach(() => {
    setupFsMock({});
    mockFs.existsSync = vi.fn(() => false);
  });

  it('ClaudeAdapter — injectPersona resolves without error (no-op by design)', async () => {
    const adapter = new ClaudeAdapter();
    const persona = {
      id: 'ninja-default',
      name: 'Ninja Engineer',
      description: 'A senior engineer persona',
      tone: 'professional' as const,
      expertise: ['TypeScript'],
      constraints: ['no any types'],
    };

    await expect(
      adapter.injectPersona(path.join(FAKE_HOME, '.claude'), persona)
    ).resolves.toBeUndefined();
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 9. VERIFICATION
// ────────────────────────────────────────────────────────────────────────────

describe('Verification', () => {
  it('ClaudeAdapter — verify() returns passed:true when CLAUDE.md has ninja:managed marker', async () => {
    const configDir = path.join(FAKE_HOME, '.claude');
    const claudeMdPath = path.join(configDir, 'CLAUDE.md');
    const commandsDir = path.join(configDir, 'commands');
    const mcpPath = path.join(FAKE_HOME, '.claude.json');

    mockFs.existsSync = vi.fn((p) => {
      const s = String(p).replace(/\\/g, '/');
      const normClaudeMd = claudeMdPath.replace(/\\/g, '/');
      const normCommands = commandsDir.replace(/\\/g, '/');
      const normMcp = mcpPath.replace(/\\/g, '/');
      return s === normClaudeMd || s === normCommands || s === normMcp;
    });
    mockFs.readFileSync = vi.fn(
      () => `${MARKER_START}\nSome content\n${MARKER_END}\n`
    ) as unknown as typeof mockFs.readFileSync;

    const adapter = new ClaudeAdapter();
    const report = await adapter.verify(configDir);

    expect(report.passed).toBe(true);
    expect(report.missing).toHaveLength(0);
  });

  it('OpenCodeAdapter — verify() checks opencode.json, skills/, and agents/', async () => {
    const configDir = path.join(FAKE_HOME, 'opencode');
    const configPath = path.join(configDir, 'opencode.json');
    const skillsDir = path.join(configDir, 'skills');
    const agentsDir = path.join(configDir, 'agents');

    mockFs.existsSync = vi.fn((p) => {
      const s = String(p).replace(/\\/g, '/');
      return (
        s === configPath.replace(/\\/g, '/') ||
        s === skillsDir.replace(/\\/g, '/') ||
        s === agentsDir.replace(/\\/g, '/')
      );
    });
    mockFs.readFileSync = vi.fn(() =>
      JSON.stringify({ systemPrompt: 'Prompt', mcpServers: { 'ninja-kage': {} } })
    ) as unknown as typeof mockFs.readFileSync;

    const adapter = new OpenCodeAdapter();
    const report = await adapter.verify(configDir);

    expect(report.passed).toBe(true);
    expect(report.warnings).toHaveLength(0);
  });

  it('WindsurfAdapter — verify() checks ninja-orchestrator.md and mcp_config.json', async () => {
    const configDir = path.join(FAKE_HOME, '.codeium', 'windsurf');
    const promptPath = path.join(configDir, 'memories', 'ninja-orchestrator.md');
    const mcpPath = path.join(configDir, 'mcp_config.json');
    const skillsDir = path.join(configDir, 'skills');

    mockFs.existsSync = vi.fn((p) => {
      const s = String(p).replace(/\\/g, '/');
      return (
        s === promptPath.replace(/\\/g, '/') ||
        s === mcpPath.replace(/\\/g, '/') ||
        s === skillsDir.replace(/\\/g, '/')
      );
    });
    mockFs.readFileSync = vi.fn((p) => {
      const s = String(p).replace(/\\/g, '/');
      if (s === promptPath.replace(/\\/g, '/')) return NINJA_MARKER_START;
      if (s === mcpPath.replace(/\\/g, '/')) return JSON.stringify([{ name: 'ninja-kage' }]);
      return '';
    }) as unknown as typeof mockFs.readFileSync;

    const adapter = new WindsurfAdapter();
    const report = await adapter.verify(configDir);

    expect(report.passed).toBe(true);
    expect(report.warnings).toHaveLength(0);
  });

  it.each(allAdapters)(
    '$name — verify() always returns a VerifyReport with correct shape',
    async ({ create }) => {
      mockFs.existsSync = vi.fn(() => false);
      mockFs.readFileSync = vi.fn(() => '') as unknown as typeof mockFs.readFileSync;

      const adapter = create();
      const report = await adapter.verify(adapter.globalConfigDir(FAKE_HOME));

      expect(report).toHaveProperty('passed');
      expect(report).toHaveProperty('present');
      expect(report).toHaveProperty('missing');
      expect(report).toHaveProperty('warnings');
      expect(Array.isArray(report.present)).toBe(true);
      expect(Array.isArray(report.missing)).toBe(true);
      expect(Array.isArray(report.warnings)).toBe(true);
    }
  );
});

// ────────────────────────────────────────────────────────────────────────────
// 10. AGENT IDENTITY
// ────────────────────────────────────────────────────────────────────────────

describe('Agent Identity', () => {
  it.each(allAdapters)(
    '$name — agentId() matches expected ClientId $agentId',
    ({ create, agentId }) => {
      const adapter = create();
      expect(adapter.agentId()).toBe(agentId);
    }
  );

  it.each(allAdapters)('$name — displayName() returns non-empty string', ({ create }) => {
    const adapter = create();
    expect(adapter.displayName()).toBeTruthy();
    expect(typeof adapter.displayName()).toBe('string');
  });
});
