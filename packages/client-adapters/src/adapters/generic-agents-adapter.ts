import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawn } from 'child_process';
import { BaseTransportAdapter } from '../base-adapter.js';
import type {
  IClientAdapter,
  AdapterOptions,
  AdapterResult,
  DetectionResult,
  VerifyReport,
  NinjaSkill,
  SDDAgentFile,
  MCPServerConfig,
} from '../types.js';
import type { ClientId, DelegationModel } from '@ninja/roster';
import { createLogger } from '@ninja/logging';

const log = createLogger('client-adapters:generic');

const NINJA_MARKER_START = '<!-- ninja:managed:start -->';
const NINJA_MARKER_END = '<!-- ninja:managed:end -->';

export interface GenericAgentConfig {
  agentId: ClientId;
  displayName: string;
  binary: string;
  configDir: string;
  delegationModel: DelegationModel;
  systemPromptFile?: string;
  skillsSubdir?: string | null;
  agentsSubdir?: string | null;
  mcpFile?: string;
  connectionFlags?: string[];
}

export class GenericAgentAdapter extends BaseTransportAdapter implements IClientAdapter {
  private readonly config: GenericAgentConfig;

  constructor(config: GenericAgentConfig) {
    super();
    this.config = config;
  }

  agentId(): ClientId {
    return this.config.agentId;
  }

  displayName(): string {
    return this.config.displayName;
  }

  delegationModel(): DelegationModel {
    return this.config.delegationModel;
  }

  async detect(homeDir?: string): Promise<DetectionResult> {
    const home = homeDir ?? os.homedir();
    const configDir = this.globalConfigDir(home);
    const binaryName = this.config.binary;

    let binaryPath = '';
    try {
      const cmd = os.platform() === 'win32' ? `where ${binaryName}` : `which ${binaryName}`;
      const output = execSync(cmd, { encoding: 'utf8' }).trim();
      if (output) {
        binaryPath = output.split(/\r?\n/)[0];
      }
    } catch {
      binaryPath = '';
    }

    const installed = binaryPath !== '';
    const configFound = installed && fs.existsSync(configDir);

    return {
      installed,
      binaryPath,
      configDir,
      configFound,
    };
  }

  globalConfigDir(homeDir?: string): string {
    const home = homeDir ?? os.homedir();
    const configDir = this.config.configDir;

    if (path.isAbsolute(configDir)) {
      return configDir;
    }

    if (configDir.startsWith('~')) {
      return path.join(home, configDir.slice(1));
    }

    return path.join(home, configDir);
  }

  skillsDir(homeDir?: string): string {
    const configDir = this.globalConfigDir(homeDir);
    const subdir = this.config.skillsSubdir ?? 'skills';
    return path.join(configDir, subdir);
  }

  agentsDir(homeDir?: string): string {
    const configDir = this.globalConfigDir(homeDir);
    const subdir = this.config.agentsSubdir ?? 'agents';
    return path.join(configDir, subdir);
  }

  mcpConfigPath(homeDir?: string): string {
    const configDir = this.globalConfigDir(homeDir);
    const mcpFile = this.config.mcpFile ?? 'mcp.json';
    return path.join(configDir, mcpFile);
  }

  getSystemPromptPath(homeDir?: string): string {
    const configDir = this.globalConfigDir(homeDir);
    const systemPromptFile = this.config.systemPromptFile ?? 'AGENTS.md';
    return path.join(configDir, systemPromptFile);
  }

  async injectSystemPrompt(configDir: string, content: string): Promise<void> {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    const systemPromptPath = this.getSystemPromptPath(configDir);
    const targetSubdir = path.dirname(systemPromptPath);
    if (!fs.existsSync(targetSubdir)) {
      fs.mkdirSync(targetSubdir, { recursive: true });
    }

    const wrappedContent = `${NINJA_MARKER_START}\n${content}\n${NINJA_MARKER_END}`;
    fs.writeFileSync(systemPromptPath, wrappedContent, 'utf8');
    log.info(`Injected system prompt into ${systemPromptPath}`);
  }

  async injectSkills(configDir: string, skills: NinjaSkill[]): Promise<void> {
    if (this.config.skillsSubdir === null) {
      log.info(`Skills injection skipped for ${this.config.agentId} (skillsSubdir is null)`);
      return;
    }

    const targetDir = this.skillsDir(configDir);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    for (const skill of skills) {
      const skillDir = skill.subfolder ? path.join(targetDir, skill.subfolder) : targetDir;
      if (!fs.existsSync(skillDir)) {
        fs.mkdirSync(skillDir, { recursive: true });
      }

      const filePath = path.join(skillDir, skill.filename);
      const wrappedContent = `${NINJA_MARKER_START}\n${skill.content}\n${NINJA_MARKER_END}`;

      if (fs.existsSync(filePath)) {
        const existing = fs.readFileSync(filePath, 'utf8');
        if (existing === wrappedContent) {
          continue;
        }
      }

      fs.writeFileSync(filePath, wrappedContent, 'utf8');
      log.info(`Injected skill: ${skill.filename} into ${targetDir}`);
    }
  }

  async injectSDD(configDir: string, agents: SDDAgentFile[]): Promise<void> {
    if (this.config.agentsSubdir === null || this.config.delegationModel !== 'full') {
      log.info(`SDD agents injection skipped for ${this.config.agentId}`);
      return;
    }

    const agentsDirPath = this.agentsDir(configDir);
    if (!fs.existsSync(agentsDirPath)) {
      fs.mkdirSync(agentsDirPath, { recursive: true });
    }

    for (const agent of agents) {
      const filePath = path.join(agentsDirPath, `${agent.phase}.md`);
      const wrappedContent = `${NINJA_MARKER_START}\n${agent.content}\n${NINJA_MARKER_END}`;

      if (fs.existsSync(filePath)) {
        const existing = fs.readFileSync(filePath, 'utf8');
        if (existing === wrappedContent) {
          continue;
        }
      }

      fs.writeFileSync(filePath, wrappedContent, 'utf8');
      log.info(`Injected SDD agent: ${agent.phase} into ${agentsDirPath}`);
    }
  }

  async injectMCPConfig(configDir: string, servers: MCPServerConfig[]): Promise<void> {
    const configPath = this.mcpConfigPath(configDir);
    const targetSubdir = path.dirname(configPath);
    if (!fs.existsSync(targetSubdir)) {
      fs.mkdirSync(targetSubdir, { recursive: true });
    }

    let config: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(raw);
      } catch (err) {
        log.warn(`Failed to parse config file, resetting: ${err}`);
        config = {};
      }
    }

    const mcpServers: Record<string, unknown> =
      (config.mcpServers as Record<string, unknown>) || {};
    for (const server of servers) {
      if (server.url) {
        mcpServers[server.name] = { url: server.url };
      } else {
        mcpServers[server.name] = {
          command: server.command,
          args: server.args || [],
          env: server.env || {},
        };
      }
    }

    config.mcpServers = mcpServers;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    log.info(`Injected ${servers.length} MCP server(s) into ${configPath}`);
  }

  async execute(prompt: string, options: AdapterOptions): Promise<AdapterResult> {
    const startTime = Date.now();
    const cmd = options.executablePath || this.config.binary;
    const defaultFlags = this.config.connectionFlags ?? [];
    const args = [...defaultFlags, ...(options.args || []), ...(options.flags || [])];

    log.info(`Executing generic agent task: ${this.config.agentId} via ${cmd} ${args.join(' ')}`);

    return new Promise((resolve) => {
      const child = spawn(cmd, args, {
        shell: true,
        env: { ...process.env, FORCE_COLOR: '0' },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      try {
        child.stdin.write(prompt + '\n');
        child.stdin.end();
      } catch (err) {
        log.warn('Failed to write to child process stdin:', err);
      }

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        resolve({
          status: 'timeout',
          output:
            stdout ||
            `Timeout: Process did not respond within ${options.timeoutMs || 60000}ms. Stderr: ${stderr}`,
          durationMs: Date.now() - startTime,
        });
      }, options.timeoutMs || 60000);

      child.on('close', (code) => {
        clearTimeout(timeout);
        const durationMs = Date.now() - startTime;

        if (code === 0) {
          resolve({
            status: 'success',
            output: stdout.trim(),
            durationMs,
          });
        } else {
          resolve({
            status: 'error',
            output: stdout || stderr || `Process exited with code ${code}`,
            durationMs,
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          status: 'error',
          output: `Failed to start process: ${err.message}`,
          durationMs: Date.now() - startTime,
        });
      });
    });
  }

  async verify(configDir: string): Promise<VerifyReport> {
    const present: string[] = [];
    const missing: string[] = [];
    const warnings: string[] = [];

    const systemPromptPath = this.getSystemPromptPath(configDir);
    const mcpConfigPath = this.mcpConfigPath(configDir);
    const skillsDir = this.skillsDir(configDir);
    const agentsDir = this.agentsDir(configDir);

    const expectedFiles = [
      { path: systemPromptPath, name: path.basename(systemPromptPath) },
      { path: mcpConfigPath, name: path.basename(mcpConfigPath) },
    ];

    if (this.config.skillsSubdir !== null) {
      expectedFiles.push({ path: skillsDir, name: 'skills/' });
    }

    if (this.config.agentsSubdir !== null && this.config.delegationModel === 'full') {
      expectedFiles.push({ path: agentsDir, name: 'agents/' });
    }

    for (const file of expectedFiles) {
      if (fs.existsSync(file.path)) {
        present.push(file.name);
      } else {
        missing.push(file.name);
      }
    }

    const passed = missing.length === 0;

    if (!passed) {
      warnings.push(`Missing files in ${configDir}. Run detection first.`);
    }

    return {
      passed,
      present,
      missing,
      warnings,
    };
  }
}

export function createGenericAgent(config: GenericAgentConfig): GenericAgentAdapter {
  return new GenericAgentAdapter(config);
}

export const PRESET_AGENTS: Record<string, GenericAgentConfig> = {
  trae: {
    agentId: 'trae',
    displayName: 'Trae',
    binary: 'trae',
    configDir: '~/.trae',
    delegationModel: 'solo',
    systemPromptFile: 'system-prompt.md',
    skillsSubdir: 'skills',
    agentsSubdir: null,
    mcpFile: 'mcp.json',
  },
  openclaw: {
    agentId: 'openclaw',
    displayName: 'OpenClaw',
    binary: 'openclaw',
    configDir: '~/.openclaw',
    delegationModel: 'solo',
    systemPromptFile: 'AGENTS.md',
    skillsSubdir: 'skills',
    agentsSubdir: null,
    mcpFile: 'mcp_config.json',
  },
  pi: {
    agentId: 'pi',
    displayName: 'Pi',
    binary: 'pi',
    configDir: '~/.pi',
    delegationModel: 'package-managed',
    systemPromptFile: 'config.json',
    skillsSubdir: 'skills',
    agentsSubdir: 'agents',
    mcpFile: 'mcp.json',
  },
  kilocode: {
    agentId: 'kilocode',
    displayName: 'KiloCode',
    binary: 'kilocode',
    configDir: '~/.config/kilo',
    delegationModel: 'full',
    systemPromptFile: 'AGENTS.md',
    skillsSubdir: 'skills',
    agentsSubdir: null,
    mcpFile: 'kilo.json',
  },
  'vscode-copilot': {
    agentId: 'vscode-copilot',
    displayName: 'VS Code Copilot',
    binary: 'code',
    configDir: '~/.vscode',
    delegationModel: 'full',
    systemPromptFile: 'AGENTS.md',
    skillsSubdir: '../.copilot/skills',
    agentsSubdir: '../.copilot/agents',
    mcpFile: 'mcp.json',
  },
  'deepseek-tui': {
    agentId: 'deepseek-tui',
    displayName: 'DeepSeek TUI',
    binary: 'deepseek',
    configDir: '~/.deepseek',
    delegationModel: 'solo',
    systemPromptFile: 'config.json',
    skillsSubdir: null,
    agentsSubdir: null,
    mcpFile: 'mcp.json',
    connectionFlags: ['tui'],
  },
};
