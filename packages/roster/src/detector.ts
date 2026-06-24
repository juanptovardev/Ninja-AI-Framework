import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { createLogger } from '@ninja/logging';
import type { ClientId, ClientConfig, DelegationModel } from './types.js';

const log = createLogger('roster:detector');

// ─── Path Helpers ─────────────────────────────────────────────────────────────

/**
 * Checks if a command/executable is available in the system PATH.
 */
function isExecutableInPath(executable: string): boolean {
  try {
    const cmd = os.platform() === 'win32' ? `where ${executable}` : `which ${executable}`;
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Finds the absolute path of an executable in the system PATH.
 * Returns empty string if not found.
 */
function getExecutablePathFromPath(executable: string): string {
  try {
    const cmd = os.platform() === 'win32' ? `where ${executable}` : `which ${executable}`;
    const output = execSync(cmd, { encoding: 'utf8' }).trim();
    return output.split(/\r?\n/)[0];
  } catch {
    return '';
  }
}

/**
 * Returns the XDG-compatible config home for the current platform.
 * Windows: %APPDATA%/.. → %LOCALAPPDATA% or ~/.config
 * Linux/macOS: ~/.config
 */
function getConfigHome(home: string): string {
  if (os.platform() === 'win32') {
    return process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  }
  return process.env.XDG_CONFIG_HOME || path.join(home, '.config');
}

// ─── Agent Definitions ────────────────────────────────────────────────────────
// Paths are aligned with Gentle AI's internal/agents/* adapters.

/**
 * Detects if a client is installed and returns its full configuration.
 * Config paths are corrected to match Gentle AI's adapter definitions.
 */
export function detectClient(id: ClientId, force = false): ClientConfig | null {
  const home = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const configHome = getConfigHome(home);

  let detected = false;
  let executablePath = '';
  let configDir = '';
  let configPath = '';
  let mcpConfigPath = '';
  let skillsDir = '';
  let agentsDir = '';
  let delegationModel: DelegationModel = 'solo';
  let connectionMethod: ClientConfig['connectionMethod'] = { type: 'headless-cli', command: '', flags: [] };
  let capabilities: ClientConfig['capabilities'] = [];
  let subscription = 'Free / Standard';
  let type: ClientConfig['type'] = 'cli';
  let supportsAutoInstall = false;
  let installCommand = '';
  let installUrl = '';

  switch (id) {
    // ── Claude Code ─────────────────────────────────────────────────────────
    // Binary: claude | Config: ~/.claude/ | MCP: ~/.claude.json
    // Delegation: Full (Task tool + native sub-agents)
    case 'claude-code':
      executablePath = getExecutablePathFromPath('claude');
      detected = executablePath !== '';
      configDir = path.join(home, '.claude');
      configPath = path.join(configDir, 'CLAUDE.md');
      mcpConfigPath = path.join(home, '.claude.json');
      skillsDir = path.join(configDir, 'skills');
      agentsDir = path.join(configDir, 'agents');
      delegationModel = 'full';
      connectionMethod = { type: 'headless-cli', command: 'claude', flags: ['-p', '--output-format', 'json'] };
      capabilities = [
        { name: 'delegation-full', score: 10.0 },
        { name: 'auditing', score: 9.8 },
        { name: 'sentinel', score: 9.8 },
        { name: 'coding', score: 9.2 },
      ];
      subscription = 'Anthropic Claude (Opus/Sonnet)';
      break;

    // ── OpenCode ────────────────────────────────────────────────────────────
    // Binary: opencode | Config: ~/.config/opencode/ | MCP: opencode.json
    // Delegation: Full (multi-mode overlay — per-phase model routing)
    case 'opencode':
      executablePath = getExecutablePathFromPath('opencode');
      detected = executablePath !== '';
      configDir = path.join(configHome, 'opencode');
      configPath = path.join(configDir, 'opencode.json');
      mcpConfigPath = path.join(configDir, 'opencode.json'); // MCP embedded in opencode.json
      skillsDir = path.join(configDir, 'skills');
      agentsDir = ''; // OpenCode uses overlay in opencode.json, not agent files
      delegationModel = 'full';
      connectionMethod = { type: 'mcp-stdio', command: 'opencode', args: ['--mcp'] };
      capabilities = [
        { name: 'delegation-full', score: 9.5 },
        { name: 'per-phase-models', score: 10.0 },
        { name: 'slash-commands', score: 9.0 },
      ];
      supportsAutoInstall = true;
      installCommand = 'go install github.com/opencode-ai/opencode@latest';
      installUrl = 'https://github.com/opencode-ai/opencode';
      break;

    // ── Kilo Code ───────────────────────────────────────────────────────────
    // Binary: kilocode | Config: ~/.config/kilo/ | MCP: opencode-compatible
    // Delegation: Full (OpenCode-compatible overlay)
    case 'kilocode':
      executablePath = getExecutablePathFromPath('kilocode');
      detected = executablePath !== '';
      configDir = path.join(configHome, 'kilo');
      configPath = path.join(configDir, 'kilo.json');
      mcpConfigPath = path.join(configDir, 'kilo.json');
      skillsDir = path.join(configDir, 'skills');
      agentsDir = '';
      delegationModel = 'full';
      connectionMethod = { type: 'mcp-stdio', command: 'kilocode', args: ['--mcp'] };
      capabilities = [
        { name: 'delegation-full', score: 9.0 },
        { name: 'per-phase-models', score: 9.5 },
      ];
      supportsAutoInstall = false;
      installCommand = '';
      installUrl = 'https://kilocode.ai';
      break;

    // ── Cursor ──────────────────────────────────────────────────────────────
    // Binary: cursor | Config: ~/.cursor/ | MCP: ~/.cursor/mcp.json
    // Delegation: Full (native agents in ~/.cursor/agents/)
    case 'cursor':
      configDir = path.join(home, '.cursor');
      configPath = path.join(configDir, 'rules');
      mcpConfigPath = path.join(configDir, 'mcp.json');
      skillsDir = path.join(configDir, 'skills');
      agentsDir = path.join(configDir, 'agents');
      delegationModel = 'full';
      executablePath = getExecutablePathFromPath('cursor')
        || path.join(localAppData, 'Programs', 'cursor', 'Cursor.exe');
      detected = fs.existsSync(configDir) || isExecutableInPath('cursor');
      type = 'gui';
      connectionMethod = { type: 'vsix-websocket', extensionId: 'ninja.companion', port: 7779 };
      capabilities = [
        { name: 'delegation-full', score: 9.5 },
        { name: 'native-subagents', score: 9.5 },
        { name: 'editor-integration', score: 9.5 },
      ];
      subscription = 'Cursor Pro / Business';
      supportsAutoInstall = false;
      installCommand = '';
      installUrl = 'https://cursor.sh';
      break;

    // ── VS Code Copilot ─────────────────────────────────────────────────────
    // Binary: code | Config: ~/.vscode/ + user data dir
    // Delegation: Full (runSubagent — parallel execution)
    case 'vscode-copilot': {
      executablePath = getExecutablePathFromPath('code');
      detected = executablePath !== '';
      const vscodePlatformDir = os.platform() === 'win32'
        ? path.join(localAppData, 'Code', 'User')
        : os.platform() === 'darwin'
          ? path.join(home, 'Library', 'Application Support', 'Code', 'User')
          : path.join(configHome, 'Code', 'User');
      configDir = vscodePlatformDir;
      configPath = path.join(vscodePlatformDir, 'settings.json');
      mcpConfigPath = path.join(vscodePlatformDir, 'mcp.json');
      skillsDir = path.join(home, '.copilot', 'skills');
      agentsDir = path.join(home, '.copilot', 'agents');
      delegationModel = 'full';
      type = 'gui';
      connectionMethod = { type: 'vsix-websocket', extensionId: 'github.copilot', port: 7780 };
      capabilities = [
        { name: 'delegation-full', score: 9.0 },
        { name: 'parallel-execution', score: 9.5 },
        { name: 'editor-integration', score: 10.0 },
      ];
      subscription = 'GitHub Copilot Pro / Business';
      supportsAutoInstall = false;
      installCommand = '';
      installUrl = 'https://code.visualstudio.com/docs/copilot/overview';
      break;
    }

    // ── Gemini CLI ──────────────────────────────────────────────────────────
    // Binary: gemini | Config: ~/.gemini/ | MCP: ~/.gemini/settings.json
    // Delegation: Full (experimental — custom agents in ~/.gemini/agents/)
    case 'gemini-cli':
      executablePath = getExecutablePathFromPath('gemini');
      detected = executablePath !== '';
      configDir = path.join(home, '.gemini');
      configPath = path.join(configDir, 'GEMINI.md');
      mcpConfigPath = path.join(configDir, 'settings.json');
      skillsDir = path.join(configDir, 'skills');
      agentsDir = path.join(configDir, 'agents');
      delegationModel = 'full';
      connectionMethod = { type: 'headless-cli', command: 'gemini', flags: ['-p'] };
      capabilities = [
        { name: 'delegation-full', score: 8.5 },
        { name: 'google-integration', score: 10.0 },
      ];
      subscription = 'Google Gemini (via Antigravity)';
      supportsAutoInstall = true;
      installCommand = 'npm install -g @google/gemini-cli';
      installUrl = 'https://github.com/google-gemini/gemini-cli';
      break;

    // ── Codex ───────────────────────────────────────────────────────────────
    // Binary: codex | Config: ~/.codex/ (TOML)
    // Delegation: Solo-agent (CLI-native, TOML config)
    case 'codex':
      executablePath = getExecutablePathFromPath('codex');
      detected = executablePath !== '' || isExecutableInPath('codex');
      configDir = path.join(home, '.codex');
      configPath = path.join(configDir, 'config.toml');
      mcpConfigPath = path.join(configDir, 'config.toml'); // MCP embedded in TOML
      skillsDir = path.join(configDir, 'skills');
      agentsDir = ''; // Solo-agent — no sub-agent files
      delegationModel = 'solo';
      type = 'cli';
      connectionMethod = { type: 'headless-cli', command: 'codex', flags: ['-q'] };
      capabilities = [
        { name: 'cli-native', score: 10.0 },
        { name: 'coding', score: 9.5 },
      ];
      subscription = 'OpenAI Codex / o3-pro';
      supportsAutoInstall = true;
      installCommand = 'npm install -g @openai/codex';
      installUrl = 'https://github.com/openai/codex';
      break;

    // ── Windsurf ────────────────────────────────────────────────────────────
    // Binary: windsurf | Config: ~/.codeium/windsurf/
    // Delegation: Solo-agent (Plan Mode + Code Mode)
    case 'windsurf':
      executablePath = getExecutablePathFromPath('windsurf')
        || path.join(localAppData, 'Programs', 'Windsurf', 'Windsurf.exe');
      configDir = path.join(home, '.codeium', 'windsurf');
      configPath = path.join(configDir, 'config.json');
      mcpConfigPath = path.join(configDir, 'mcp_config.json');
      skillsDir = path.join(configDir, 'memories');
      agentsDir = ''; // Solo-agent
      delegationModel = 'solo';
      detected = fs.existsSync(configDir) || fs.existsSync(executablePath) || isExecutableInPath('windsurf');
      type = 'gui';
      connectionMethod = { type: 'vsix-websocket', extensionId: 'ninja.companion', port: 7781 };
      capabilities = [
        { name: 'plan-mode', score: 9.5 },
        { name: 'code-mode', score: 9.0 },
        { name: 'native-workflows', score: 8.5 },
      ];
      subscription = 'Windsurf Pro / Teams';
      supportsAutoInstall = false;
      installCommand = '';
      installUrl = 'https://codeium.com/windsurf';
      break;

    // ── Antigravity (Mission Control) ────────────────────────────────────────
    // Binary: antigravity | Config: ~/.gemini/antigravity/
    // Delegation: Solo-agent + Mission Control (built-in Browser/Terminal sub-agents)
    case 'antigravity-2':
      executablePath = getExecutablePathFromPath('antigravity')
        || path.join(localAppData, 'Programs', 'antigravity', 'antigravity.exe');
      detected = fs.existsSync(executablePath) || isExecutableInPath('antigravity');
      configDir = path.join(home, '.gemini', 'antigravity');
      configPath = path.join(configDir, 'AGENTS.md');
      mcpConfigPath = path.join(home, '.gemini', 'config', 'mcp_config.json');
      skillsDir = path.join(home, '.gemini', 'config', 'skills');
      agentsDir = path.join(home, '.gemini', 'config', 'agents');
      delegationModel = 'solo'; // Solo + built-in Mission Control sub-agents
      type = 'gui';
      connectionMethod = { type: 'mcp-http', url: 'http://localhost:8500/mcp' };
      capabilities = [
        { name: 'mission-control', score: 10.0 },
        { name: 'browser', score: 9.5 },
        { name: 'orchestration', score: 9.0 },
      ];
      supportsAutoInstall = false;
      installCommand = '';
      installUrl = 'https://antigravity.google';
      break;

    // ── Antigravity CLI ──────────────────────────────────────────────────────
    // Binary: agy | Config: ~/.gemini/
    case 'antigravity-cli':
      executablePath = getExecutablePathFromPath('agy');
      detected = executablePath !== '';
      configDir = path.join(home, '.gemini');
      configPath = path.join(configDir, 'GEMINI.md');
      mcpConfigPath = path.join(home, '.gemini', 'config', 'mcp_config.json');
      skillsDir = path.join(home, '.gemini', 'config', 'skills');
      agentsDir = path.join(home, '.gemini', 'config', 'agents');
      delegationModel = 'solo';
      connectionMethod = { type: 'mcp-stdio', command: 'agy', args: ['mcp', 'start'] };
      capabilities = [
        { name: 'worker', score: 9.0 },
        { name: 'orchestration', score: 8.0 },
      ];
      supportsAutoInstall = false;
      installCommand = '';
      installUrl = 'https://antigravity.google';
      break;

    // ── Kimi Code ───────────────────────────────────────────────────────────
    // Binary: kimi | Config: ~/.kimi/
    // Delegation: Full (native custom agents)
    case 'kimi-code':
      executablePath = getExecutablePathFromPath('kimi');
      detected = executablePath !== '';
      configDir = path.join(home, '.kimi');
      configPath = path.join(configDir, 'AGENTS.md');
      mcpConfigPath = path.join(configDir, 'mcp.json');
      skillsDir = path.join(configDir, 'skills');
      agentsDir = path.join(configDir, 'agents');
      delegationModel = 'full';
      connectionMethod = { type: 'headless-cli', command: 'kimi', flags: ['--run'] };
      capabilities = [
        { name: 'delegation-full', score: 8.5 },
        { name: 'fast-inference', score: 9.0 },
      ];
      subscription = 'Kimi k2 / k1.5';
      supportsAutoInstall = true;
      installCommand = 'pip install kimi-code';
      installUrl = 'https://github.com/MoonshotAI/Kimi-Code';
      break;

    // ── Kiro IDE ────────────────────────────────────────────────────────────
    // Binary: kiro | Config: ~/.kiro/
    // Delegation: Full (native subagents in ~/.kiro/agents/)
    case 'kiro-ide':
      executablePath = getExecutablePathFromPath('kiro');
      detected = executablePath !== '' || fs.existsSync(path.join(home, '.kiro'));
      configDir = path.join(home, '.kiro');
      configPath = path.join(configDir, 'settings', 'system-prompt.md');
      mcpConfigPath = path.join(configDir, 'settings', 'mcp.json');
      skillsDir = path.join(configDir, 'skills');
      agentsDir = path.join(configDir, 'agents');
      delegationModel = 'full';
      type = 'gui';
      connectionMethod = { type: 'mcp-stdio', command: 'kiro', args: ['--mcp'] };
      capabilities = [
        { name: 'delegation-full', score: 9.0 },
        { name: 'steering-orchestration', score: 9.5 },
      ];
      supportsAutoInstall = false;
      installCommand = '';
      installUrl = 'https://kiro.dev';
      break;

    // ── Qwen Code ───────────────────────────────────────────────────────────
    // Binary: qwen | Config: ~/.qwen/
    // Delegation: Full (native sub-agents + slash commands)
    case 'qwen-code':
      executablePath = getExecutablePathFromPath('qwen');
      detected = executablePath !== '';
      configDir = path.join(home, '.qwen');
      configPath = path.join(configDir, 'AGENTS.md');
      mcpConfigPath = path.join(configDir, 'mcp.json');
      skillsDir = path.join(configDir, 'skills');
      agentsDir = path.join(configDir, 'agents');
      delegationModel = 'full';
      connectionMethod = { type: 'headless-cli', command: 'qwen', flags: ['--exec'] };
      capabilities = [
        { name: 'delegation-full', score: 8.5 },
        { name: 'slash-commands', score: 9.0 },
        { name: 'auto-edit', score: 9.0 },
      ];
      supportsAutoInstall = false;
      installCommand = '';
      installUrl = 'https://github.com/QwenLM/Qwen3-Coder';
      break;

    // ── OpenClaw ────────────────────────────────────────────────────────────
    // Binary: openclaw | Config: ~/.openclaw/
    // Delegation: Solo-agent (workspace-first AGENTS.md/SOUL.md)
    case 'openclaw':
      executablePath = getExecutablePathFromPath('openclaw');
      detected = executablePath !== '';
      configDir = path.join(home, '.openclaw');
      configPath = path.join(configDir, 'AGENTS.md');
      mcpConfigPath = path.join(configDir, 'mcp_config.json');
      skillsDir = path.join(configDir, 'skills');
      agentsDir = '';
      delegationModel = 'solo';
      connectionMethod = { type: 'headless-cli', command: 'openclaw', flags: ['--run'] };
      capabilities = [
        { name: 'workspace-first', score: 9.0 },
      ];
      supportsAutoInstall = false;
      installCommand = '';
      installUrl = 'https://github.com/openclaw/openclaw';
      break;

    // ── Trae ────────────────────────────────────────────────────────────────
    // Binary: trae | Config: ~/.trae/
    // Delegation: Solo-agent (ByteDance desktop app)
    case 'trae':
      executablePath = getExecutablePathFromPath('trae');
      detected = executablePath !== '' || fs.existsSync(path.join(home, '.trae'));
      configDir = path.join(home, '.trae');
      configPath = path.join(configDir, 'system-prompt.md');
      mcpConfigPath = path.join(configDir, 'mcp.json');
      skillsDir = path.join(configDir, 'skills');
      agentsDir = '';
      delegationModel = 'solo';
      type = 'gui';
      connectionMethod = { type: 'mcp-stdio', command: 'trae', args: ['--mcp'] };
      capabilities = [
        { name: 'desktop-app', score: 8.5 },
        { name: 'os-native', score: 9.0 },
      ];
      supportsAutoInstall = false;
      installCommand = '';
      installUrl = 'https://trae.ai';
      break;

    // ── Pi ──────────────────────────────────────────────────────────────────
    // Binary: pi | Config: ~/.pi/
    // Delegation: Package-managed (gentle-pi harness with persona/model commands)
    case 'pi':
      executablePath = getExecutablePathFromPath('pi');
      detected = executablePath !== '';
      configDir = path.join(home, '.pi');
      configPath = path.join(configDir, 'config.json');
      mcpConfigPath = path.join(configDir, 'mcp.json');
      skillsDir = path.join(configDir, 'skills');
      agentsDir = path.join(configDir, 'agents');
      delegationModel = 'package-managed';
      connectionMethod = { type: 'mcp-stdio', command: 'pi', args: ['--mcp'] };
      capabilities = [
        { name: 'package-managed-agents', score: 9.5 },
        { name: 'memory', score: 9.0 },
      ];
      supportsAutoInstall = false;
      installCommand = '';
      installUrl = 'https://github.com/badlogic/pi-mono';
      break;

    // ── DeepSeek TUI ────────────────────────────────────────────────────────
    case 'deepseek-tui':
      executablePath = getExecutablePathFromPath('deepseek');
      detected = executablePath !== '';
      configDir = path.join(home, '.deepseek');
      configPath = path.join(configDir, 'config.json');
      mcpConfigPath = path.join(configDir, 'mcp.json');
      skillsDir = '';
      agentsDir = '';
      delegationModel = 'solo';
      connectionMethod = { type: 'pty', command: 'deepseek', args: ['tui'], interactive: true };
      capabilities = [
        { name: 'fast-inference', score: 9.5 },
        { name: 'worker', score: 9.0 },
      ];
      supportsAutoInstall = false;
      installCommand = '';
      installUrl = 'https://github.com/DeepSeek-Org/DeepSeek-Coder';
      break;

    default:
      log.warn(`Unknown client id: ${id}`);
      return null;
  }

  if (!detected && !force) {
    log.debug(`Client ${id} not detected on this system.`);
    return null;
  }

  log.info(`Detected client: ${id} at ${executablePath || 'PATH'} (config: ${configDir})`);

  return {
    id,
    name: id.toUpperCase(),
    type,
    executablePath,
    configPath,
    configDir,
    mcpConfigPath,
    skillsDir,
    agentsDir,
    status: 'disconnected',
    capabilities,
    assignedRole: determineDefaultRole(id),
    delegationModel,
    connectionMethod,
    subscription,
    supportsAutoInstall,
    installCommand,
    installUrl,
  };
}

/**
 * Determines the default role for a client based on its capabilities.
 * Aligned with Gentle AI's role-assignment logic.
 */
function determineDefaultRole(id: ClientId): ClientConfig['assignedRole'] {
  // Primary orchestrators (high orchestration + subagent capability)
  const orchestrators: ClientId[] = ['codex', 'cursor', 'antigravity-2', 'gemini-cli'];
  // Sentinel candidates (auditing/review focus)
  const sentinels: ClientId[] = ['claude-code'];

  if (sentinels.includes(id)) return 'sentinel';
  if (orchestrators.includes(id)) return 'orchestrator';
  return 'worker';
}

/**
 * Returns all supported client IDs.
 * Aligned with Gentle AI's 15 supported agents.
 */
export const ALL_CLIENT_IDS: ClientId[] = [
  'claude-code',
  'opencode',
  'kilocode',
  'gemini-cli',
  'cursor',
  'vscode-copilot',
  'codex',
  'windsurf',
  'antigravity-2',
  'antigravity-cli',
  'kimi-code',
  'kiro-ide',
  'qwen-code',
  'openclaw',
  'trae',
  'pi',
  'deepseek-tui',
];

/**
 * Scans the system for all supported external clients.
 * Returns only those that are actually installed.
 */
export function detectAllClients(): Record<ClientId, ClientConfig> {
  const result = {} as Record<ClientId, ClientConfig>;

  for (const client of ALL_CLIENT_IDS) {
    const config = detectClient(client);
    if (config) {
      result[client] = config;
    }
  }

  log.info(`Detection complete. Found ${Object.keys(result).length} clients: ${Object.keys(result).join(', ')}`);
  return result;
}
