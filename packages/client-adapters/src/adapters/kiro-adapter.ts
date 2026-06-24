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
import type { ClientId } from '@ninja/roster';
import { createLogger } from '@ninja/logging';

const log = createLogger('client-adapters:kiro');

const NINJA_MARKER_START = '<!-- ninja:managed:start -->';
const NINJA_MARKER_END = '<!-- ninja:managed:end -->';

export class KiroAdapter extends BaseTransportAdapter implements IClientAdapter {
  agentId(): ClientId {
    return 'kiro-ide';
  }

  displayName(): string {
    return 'Kiro IDE';
  }

  delegationModel(): 'full' {
    return 'full';
  }

  async detect(homeDir?: string): Promise<DetectionResult> {
    const home = homeDir ?? os.homedir();
    const configDir = this.globalConfigDir(home);
    const binaryName = 'kiro';

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
    return path.join(home, '.kiro');
  }

  skillsDir(homeDir?: string): string {
    const configDir = this.globalConfigDir(homeDir);
    return path.join(configDir, 'skills');
  }

  agentsDir(homeDir?: string): string {
    const configDir = this.globalConfigDir(homeDir);
    return path.join(configDir, 'agents');
  }

  mcpConfigPath(homeDir?: string): string {
    const home = homeDir ?? os.homedir();
    return path.join(home, '.kiro', 'settings', 'mcp.json');
  }

  async injectSystemPrompt(configDir: string, content: string): Promise<void> {
    const targetDir = path.join(configDir, 'settings');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const filePath = path.join(targetDir, 'system-prompt.md');
    const wrappedContent = `${NINJA_MARKER_START}\n${content}\n${NINJA_MARKER_END}`;
    fs.writeFileSync(filePath, wrappedContent, 'utf8');
    log.info(`Injected system prompt into ${filePath}`);
  }

  async injectSkills(configDir: string, skills: NinjaSkill[]): Promise<void> {
    const targetDir = path.join(configDir, 'skills');
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
    const agentsDirPath = path.join(configDir, 'agents');
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
    const targetDir = path.join(configDir, 'settings');
    const configPath = path.join(targetDir, 'mcp.json');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    let config: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(raw);
      } catch (err) {
        log.warn(`Failed to parse mcp.json, resetting: ${err}`);
        config = {};
      }
    }

    const mcpServers: Record<string, unknown> = (config.mcpServers as Record<string, unknown>) || {};
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
    const cmd = options.executablePath || 'kiro';
    const args = [...(options.args || []), ...(options.flags || [])];

    log.info(`Executing Kiro CLI task: ${cmd} ${args.join(' ')}`);

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
          output: stdout || `Timeout: Process did not respond within ${options.timeoutMs || 60000}ms. Stderr: ${stderr}`,
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

    const expectedFiles = [
      { path: path.join(configDir, 'settings', 'system-prompt.md'), name: 'system-prompt.md' },
      { path: path.join(configDir, 'settings', 'mcp.json'), name: 'mcp.json' },
      { path: this.skillsDir(), name: 'skills/' },
      { path: this.agentsDir(), name: 'agents/' },
    ];

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