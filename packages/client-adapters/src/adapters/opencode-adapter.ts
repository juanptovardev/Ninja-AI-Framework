import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawn } from 'child_process';
import { BaseTransportAdapter } from '../base-adapter.js';
import { createLogger } from '@ninja/logging';
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

const log = createLogger('client-adapters:opencode');

export class OpenCodeAdapter extends BaseTransportAdapter implements IClientAdapter {
  agentId(): ClientId {
    return 'opencode';
  }

  displayName(): string {
    return 'OpenCode';
  }

  delegationModel(): DelegationModel {
    return 'full';
  }

  globalConfigDir(homeDir?: string): string {
    const home = homeDir || os.homedir();
    const configHome = os.platform() === 'win32'
      ? (process.env.APPDATA || path.join(home, 'AppData', 'Roaming'))
      : (process.env.XDG_CONFIG_HOME || path.join(home, '.config'));
    return path.join(configHome, 'opencode');
  }

  skillsDir(homeDir?: string): string {
    return path.join(this.globalConfigDir(homeDir), 'skills');
  }

  agentsDir(homeDir?: string): string {
    return path.join(this.globalConfigDir(homeDir), 'agents');
  }

  mcpConfigPath(homeDir?: string): string {
    return path.join(this.globalConfigDir(homeDir), 'opencode.json');
  }

  async detect(homeDir?: string): Promise<DetectionResult> {
    const configDir = this.globalConfigDir(homeDir);
    let binaryPath = '';
    let installed = false;
    let error: Error | undefined;

    try {
      const cmd = os.platform() === 'win32' ? 'where opencode' : 'which opencode';
      binaryPath = execSync(cmd, { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
      installed = binaryPath.length > 0;
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      installed = false;
    }

    let configFound = false;
    try {
      configFound = fs.existsSync(configDir);
    } catch {
      configFound = false;
    }

    return {
      installed,
      binaryPath,
      configDir,
      configFound,
      error,
    };
  }

  async injectSystemPrompt(configDir: string, content: string): Promise<void> {
    const configPath = path.join(configDir, 'opencode.json');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    let config: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch (err) {
        log.warn(`Failed to parse opencode.json, resetting: ${err}`);
        config = {};
      }
    }

    config.systemPrompt = content;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    log.info(`Injected system prompt into ${configPath}`);
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
      if (fs.existsSync(filePath)) {
        const existing = fs.readFileSync(filePath, 'utf8');
        if (existing === skill.content) {
          continue;
        }
      }

      fs.writeFileSync(filePath, skill.content, 'utf8');
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
      if (fs.existsSync(filePath)) {
        const existing = fs.readFileSync(filePath, 'utf8');
        if (existing === agent.content) {
          continue;
        }
      }

      fs.writeFileSync(filePath, agent.content, 'utf8');
      log.info(`Injected SDD agent: ${agent.phase} into ${agentsDirPath}`);
    }
  }

  async injectMCPConfig(configDir: string, servers: MCPServerConfig[]): Promise<void> {
    const configPath = path.join(configDir, 'opencode.json');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    let config: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch (err) {
        log.warn(`Failed to parse opencode.json, resetting: ${err}`);
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
    const cmd = options.executablePath || 'opencode';
    const args = ['--mcp']; // OpenCode CLI defaults to mcp stdio connection method

    log.info(`Executing OpenCode CLI: ${cmd} ${args.join(' ')}`);

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
          output: stdout || `OpenCode CLI timeout: ${options.timeoutMs || 120000}ms. Stderr: ${stderr}`,
          durationMs: Date.now() - startTime,
        });
      }, options.timeoutMs || 120000);

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
            output: stdout || stderr || `OpenCode CLI exited with code ${code}`,
            durationMs,
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          status: 'error',
          output: `Failed to start OpenCode CLI: ${err.message}`,
          durationMs: Date.now() - startTime,
        });
      });
    });
  }

  async verify(configDir: string): Promise<VerifyReport> {
    const present: string[] = [];
    const missing: string[] = [];
    const warnings: string[] = [];

    const configPath = path.join(configDir, 'opencode.json');
    if (fs.existsSync(configPath)) {
      present.push(configPath);
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (!config.systemPrompt) {
          warnings.push('opencode.json lacks systemPrompt overlay');
        }
        if (!config.mcpServers || Object.keys(config.mcpServers as Record<string, unknown>).length === 0) {
          warnings.push('No MCP servers configured in opencode.json');
        }
      } catch {
        warnings.push('opencode.json is not valid JSON');
      }
    } else {
      missing.push(configPath);
    }

    const skillsDirPath = path.join(configDir, 'skills');
    if (fs.existsSync(skillsDirPath)) {
      present.push(skillsDirPath);
    } else {
      missing.push(skillsDirPath);
    }

    const agentsDirPath = path.join(configDir, 'agents');
    if (fs.existsSync(agentsDirPath)) {
      present.push(agentsDirPath);
    } else {
      missing.push(agentsDirPath);
    }

    return {
      passed: missing.length === 0,
      present,
      missing,
      warnings,
    };
  }
}
