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

const log = createLogger('client-adapters:windsurf');

const NINJA_MARKER_START = '# NINJA-MANAGED-START';
const NINJA_MARKER_END = '# NINJA-MANAGED-END';

export class WindsurfAdapter extends BaseTransportAdapter {
  agentId(): ClientId {
    return 'windsurf';
  }

  displayName(): string {
    return 'Windsurf (Codeium)';
  }

  delegationModel(): DelegationModel {
    return 'solo';
  }

  globalConfigDir(homeDir?: string): string {
    const home = homeDir || os.homedir();
    return path.join(home, '.codeium', 'windsurf');
  }

  skillsDir(homeDir?: string): string {
    return path.join(this.globalConfigDir(homeDir), 'skills');
  }

  agentsDir(_homeDir?: string): string {
    return '';
  }

  mcpConfigPath(homeDir?: string): string {
    return path.join(this.globalConfigDir(homeDir), 'mcp_config.json');
  }

  async detect(homeDir?: string): Promise<DetectionResult> {
    const configDir = this.globalConfigDir(homeDir);
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    let binaryPath = '';
    let installed = false;
    let error: Error | undefined;

    try {
      const cmd = os.platform() === 'win32' ? 'where windsurf' : 'which windsurf';
      binaryPath = execSync(cmd, { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
      installed = binaryPath.length > 0;
    } catch {
      const guiPath = path.join(localAppData, 'Programs', 'Windsurf', 'Windsurf.exe');
      if (fs.existsSync(guiPath)) {
        binaryPath = guiPath;
        installed = true;
      }
    }

    let configFound = false;
    try {
      configFound = fs.existsSync(configDir);
    } catch {
      configFound = false;
    }

    if (!installed) {
      error = new Error('Windsurf binary not found in PATH or common install locations');
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
    const memoriesDir = path.join(configDir, 'memories');

    if (!fs.existsSync(memoriesDir)) {
      fs.mkdirSync(memoriesDir, { recursive: true });
    }

    const filePath = path.join(memoriesDir, 'ninja-orchestrator.md');
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
      log.info(`Injected skill: ${skill.filename}`);
    }
  }

  async injectSDD(_configDir: string, _agents: SDDAgentFile[]): Promise<void> {
    log.info('Windsurf is solo-agent — SDD agent injection is a no-op');
  }

  async injectMCPConfig(configDir: string, servers: MCPServerConfig[]): Promise<void> {
    const configPath = path.join(configDir, 'mcp_config.json');

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    let config: unknown[] = [];
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(raw);
        if (!Array.isArray(config)) {
          log.warn('mcp_config.json is not an array, resetting');
          config = [];
        }
      } catch (err) {
        const parseError = err instanceof Error ? err.message : String(err);
        log.warn(`Failed to parse mcp_config.json, resetting: ${parseError}`);
        config = [];
      }
    }

    for (const server of servers) {
      const entry: Record<string, unknown> = {
        name: server.name,
      };

      if (server.url) {
        entry.url = server.url;
      } else {
        entry.command = server.command;
        if (server.args && server.args.length > 0) {
          entry.args = server.args;
        }
        if (server.env && Object.keys(server.env).length > 0) {
          entry.env = server.env;
        }
      }

      const existing = (config as Record<string, unknown>[]).findIndex(
        (e: Record<string, unknown>) => e.name === server.name
      );
      if (existing >= 0) {
        (config as Record<string, unknown>[])[existing] = entry;
      } else {
        (config as Record<string, unknown>[]).push(entry);
      }
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    log.info(`Injected ${servers.length} MCP server(s) into ${configPath}`);
  }

  async execute(prompt: string, options: AdapterOptions): Promise<AdapterResult> {
    const startTime = Date.now();
    const cmd = options.executablePath || 'windsurf';
    const args = options.args || [];

    log.info(`Executing Windsurf: ${cmd} ${args.join(' ')}`);

    return new Promise((resolve) => {
      const child = spawn(cmd, args, {
        shell: true,
        env: { ...process.env, FORCE_COLOR: '0' },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        if (chunk.match(/[>?:]\s*$/) || chunk.toLowerCase().includes('prompt') || chunk.toLowerCase().includes('enter')) {
          try {
            child.stdin.write(prompt + '\n');
          } catch (e) {
            log.warn('Failed to write prompt to Windsurf stdin:', e);
          }
        }
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      try {
        child.stdin.write(prompt + '\n');
      } catch (err) {
        log.warn('Initial stdin write to Windsurf failed:', err);
      }

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        resolve({
          status: 'timeout',
          output: stdout || `Windsurf timeout: ${options.timeoutMs || 120000}ms. Stderr: ${stderr}`,
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
            output: stdout || stderr || `Windsurf exited with code ${code}`,
            durationMs,
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          status: 'error',
          output: `Failed to start Windsurf: ${err.message}`,
          durationMs: Date.now() - startTime,
        });
      });
    });
  }

  async verify(configDir: string): Promise<VerifyReport> {
    const present: string[] = [];
    const missing: string[] = [];
    const warnings: string[] = [];

    const memoriesDir = path.join(configDir, 'memories');
    const ninjaPromptPath = path.join(memoriesDir, 'ninja-orchestrator.md');

    if (fs.existsSync(ninjaPromptPath)) {
      present.push(ninjaPromptPath);
      try {
        const content = fs.readFileSync(ninjaPromptPath, 'utf8');
        if (!content.includes(NINJA_MARKER_START)) {
          warnings.push('ninja-orchestrator.md exists but lacks NINJA-MANAGED marker');
        }
      } catch {
        warnings.push('Could not read ninja-orchestrator.md');
      }
    } else {
      missing.push(ninjaPromptPath);
    }

    const mcpPath = path.join(configDir, 'mcp_config.json');
    if (fs.existsSync(mcpPath)) {
      present.push(mcpPath);
      try {
        const raw = fs.readFileSync(mcpPath, 'utf8');
        const config = JSON.parse(raw);
        if (Array.isArray(config) && config.length === 0) {
          warnings.push('mcp_config.json is empty');
        }
      } catch {
        warnings.push('mcp_config.json is not valid JSON');
      }
    } else {
      missing.push(mcpPath);
    }

    const skillsDirPath = path.join(configDir, 'skills');
    if (fs.existsSync(skillsDirPath)) {
      present.push(skillsDirPath);
    } else {
      missing.push(skillsDirPath);
    }

    return {
      passed: missing.length === 0,
      present,
      missing,
      warnings,
    };
  }
}