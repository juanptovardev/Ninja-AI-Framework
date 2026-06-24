import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { BaseTransportAdapter } from '../base-adapter.js';
import { createLogger } from '@ninja/logging';
import type {
  DetectionResult,
  NinjaSkill,
  SDDAgentFile,
  MCPServerConfig,
  VerifyReport,
  DelegationModel,
  AdapterOptions,
  AdapterResult,
} from '../types.js';
import type { ClientId } from '@ninja/roster';
import { spawn } from 'child_process';

const log = createLogger('client-adapters:gemini-cli');

const NINJA_MARKER_START = '# NINJA-MANAGED-START';
const NINJA_MARKER_END = '# NINJA-MANAGED-END';

export class GeminiCliAdapter extends BaseTransportAdapter {
  agentId(): ClientId {
    return 'gemini-cli';
  }

  displayName(): string {
    return 'Gemini CLI (Google)';
  }

  delegationModel(): DelegationModel {
    return 'full';
  }

  globalConfigDir(homeDir?: string): string {
    const home = homeDir || os.homedir();
    return path.join(home, '.gemini');
  }

  skillsDir(homeDir?: string): string {
    const home = homeDir || os.homedir();
    const primary = path.join(home, '.gemini', 'skills');
    const secondary = path.join(home, '.gemini', 'config', 'skills');
    if (fs.existsSync(secondary)) {
      return secondary;
    }
    return primary;
  }

  agentsDir(homeDir?: string): string {
    return path.join(this.globalConfigDir(homeDir), 'agents');
  }

  mcpConfigPath(homeDir?: string): string {
    return path.join(this.globalConfigDir(homeDir), 'settings.json');
  }

  async detect(homeDir?: string): Promise<DetectionResult> {
    const configDir = this.globalConfigDir(homeDir);
    let binaryPath = '';
    let installed = false;
    let error: Error | undefined;

    try {
      const cmd = os.platform() === 'win32' ? 'where gemini' : 'which gemini';
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
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const filePath = path.join(configDir, 'GEMINI.md');
    const wrappedContent = `${NINJA_MARKER_START}\n${content}\n${NINJA_MARKER_END}`;

    fs.writeFileSync(filePath, wrappedContent, 'utf8');
    log.info(`Injected system prompt into ${filePath}`);
  }

  async injectSkills(configDir: string, skills: NinjaSkill[]): Promise<void> {
    const primarySkills = path.join(configDir, 'skills');
    const secondarySkills = path.join(configDir, 'config', 'skills');
    const targetDir = fs.existsSync(secondarySkills) ? secondarySkills : primarySkills;

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
    const configPath = path.join(configDir, 'settings.json');

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    let config: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(raw);
      } catch (err) {
        const parseError = err instanceof Error ? err.message : String(err);
        log.warn(`Failed to parse settings.json, resetting: ${parseError}`);
        config = {};
      }
    }

    const mcpServers: Record<string, unknown> = (config.mcpServers as Record<string, unknown>) || {};

    for (const server of servers) {
      if (server.url) {
        mcpServers[server.name] = {
          url: server.url,
        };
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
    const cmd = options.executablePath || 'gemini';
    const args = ['-p', prompt];

    log.info(`Executing Gemini CLI: ${cmd} ${args.join(' ')}`);

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

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        resolve({
          status: 'timeout',
          output: stdout || `Gemini CLI timeout: ${options.timeoutMs || 120000}ms. Stderr: ${stderr}`,
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
            output: stdout || stderr || `Gemini CLI exited with code ${code}`,
            durationMs,
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          status: 'error',
          output: `Failed to start Gemini CLI: ${err.message}`,
          durationMs: Date.now() - startTime,
        });
      });
    });
  }

  async verify(configDir: string): Promise<VerifyReport> {
    const present: string[] = [];
    const missing: string[] = [];
    const warnings: string[] = [];

    const geminiMdPath = path.join(configDir, 'GEMINI.md');
    if (fs.existsSync(geminiMdPath)) {
      present.push(geminiMdPath);
      try {
        const content = fs.readFileSync(geminiMdPath, 'utf8');
        if (!content.includes(NINJA_MARKER_START)) {
          warnings.push('GEMINI.md exists but lacks NINJA-MANAGED marker');
        }
      } catch {
        warnings.push('Could not read GEMINI.md');
      }
    } else {
      missing.push(geminiMdPath);
    }

    const settingsPath = path.join(configDir, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      present.push(settingsPath);
      try {
        const raw = fs.readFileSync(settingsPath, 'utf8');
        const config = JSON.parse(raw);
        if (!config.mcpServers || Object.keys(config.mcpServers as Record<string, unknown>).length === 0) {
          warnings.push('No MCP servers configured in settings.json');
        }
      } catch {
        warnings.push('settings.json is not valid JSON');
      }
    } else {
      missing.push(settingsPath);
    }

    const agentsDirPath = path.join(configDir, 'agents');
    if (fs.existsSync(agentsDirPath)) {
      present.push(agentsDirPath);
    } else {
      missing.push(agentsDirPath);
    }

    const skillsDirPath = path.join(configDir, 'skills');
    const configSkillsDirPath = path.join(configDir, 'config', 'skills');
    if (fs.existsSync(skillsDirPath) || fs.existsSync(configSkillsDirPath)) {
      if (fs.existsSync(skillsDirPath)) {
        present.push(skillsDirPath);
      }
      if (fs.existsSync(configSkillsDirPath)) {
        present.push(configSkillsDirPath);
      }
    } else {
      missing.push('skills (neither ~/.gemini/skills/ nor ~/.gemini/config/skills/ found)');
    }

    return {
      passed: missing.length === 0,
      present,
      missing,
      warnings,
    };
  }
}