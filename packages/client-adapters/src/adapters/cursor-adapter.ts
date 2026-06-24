import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import crypto from 'crypto';
import { createLogger } from '@ninja/logging';
import { BaseTransportAdapter } from '../base-adapter.js';
import type {
  AdapterOptions,
  AdapterResult,
  DetectionResult,
  NinjaSkill,
  SDDAgentFile,
  MCPServerConfig,
  VerifyReport,
} from '../types.js';
import type { ClientId } from '@ninja/roster';

const log = createLogger('client-adapters:cursor');

const NINJA_MARKER_START = '<!-- ninja:managed:start -->';
const NINJA_MARKER_END = '<!-- ninja:managed:end -->';

const MDC_FRONTMATTER_TEMPLATE = `---
description: Ninja Orchestrator System Prompt
globs: 
---
`;

export class CursorAdapter extends BaseTransportAdapter {
  agentId(): ClientId {
    return 'cursor';
  }

  displayName(): string {
    return 'Cursor IDE';
  }

  delegationModel(): 'full' | 'solo' | 'package-managed' {
    return 'full';
  }

  async detect(homeDir?: string): Promise<DetectionResult> {
    const home = homeDir || os.homedir();
    const configDir = this.globalConfigDir(home);
    const configFound = fs.existsSync(configDir);

    let installed = false;
    let binaryPath = '';

    try {
      const cmd = os.platform() === 'win32' ? 'where cursor' : 'which cursor';
      const output = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
      const lines = output.trim().split(/\r?\n/);
      binaryPath = lines[0].trim();
      installed = true;
    } catch {
      installed = false;
    }

    return { installed, binaryPath, configDir, configFound };
  }

  globalConfigDir(homeDir?: string): string {
    const home = homeDir || os.homedir();
    return path.join(home, '.cursor');
  }

  skillsDir(homeDir?: string): string {
    const home = homeDir || os.homedir();
    return path.join(home, '.cursor', 'skills');
  }

  agentsDir(homeDir?: string): string {
    const home = homeDir || os.homedir();
    return path.join(home, '.cursor', 'agents');
  }

  mcpConfigPath(homeDir?: string): string {
    const home = homeDir || os.homedir();
    return path.join(home, '.cursor', 'mcp.json');
  }

  private systemPromptPath(configDir: string): string {
    return path.join(configDir, 'rules', 'ninja-orchestrator.mdc');
  }

  async injectSystemPrompt(configDir: string, content: string): Promise<void> {
    const filePath = this.systemPromptPath(configDir);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    const managedBlock = [
      NINJA_MARKER_START,
      content.trim(),
      NINJA_MARKER_END,
    ].join('\n');

    const fullContent = MDC_FRONTMATTER_TEMPLATE + managedBlock + '\n';

    if (!fs.existsSync(filePath)) {
      this.atomicWrite(filePath, fullContent);
      log.info(`Created MDC rule file at ${filePath}`);
      return;
    }

    const existing = fs.readFileSync(filePath, 'utf8');

    if (existing.includes(NINJA_MARKER_START)) {
      const before = existing.slice(0, existing.indexOf(NINJA_MARKER_START));
      const afterMarker = existing.slice(existing.indexOf(NINJA_MARKER_END) + NINJA_MARKER_END.length);
      const frontmatterStart = '---\n';
      const frontmatterEnd = '---\n';
      let preservedFrontmatter = '';
      if (existing.startsWith(frontmatterStart)) {
        const endIdx = existing.indexOf(frontmatterEnd, frontmatterStart.length);
        if (endIdx !== -1) {
          preservedFrontmatter = existing.slice(0, endIdx + frontmatterEnd.length);
        }
      }
      let newContent: string;
      if (preservedFrontmatter) {
        const afterFm = existing.slice(preservedFrontmatter.length);
        const beforeBlock = afterFm.slice(0, afterFm.indexOf(NINJA_MARKER_START));
        const afterBlock = afterFm.slice(afterFm.indexOf(NINJA_MARKER_END) + NINJA_MARKER_END.length);
        newContent = preservedFrontmatter + beforeBlock + managedBlock + afterBlock;
      } else {
        newContent = before + managedBlock + afterMarker;
      }
      this.atomicWrite(filePath, newContent);
    } else {
      const separator = existing.endsWith('\n') ? '' : '\n';
      this.atomicWrite(filePath, existing + separator + '\n' + managedBlock + '\n');
    }

    log.info(`Injected system prompt into ${filePath}`);
  }

  async injectSkills(configDir: string, skills: NinjaSkill[]): Promise<void> {
    const baseDir = this.skillsDir();
    if (!baseDir) {
      log.warn('skillsDir is empty for CursorAdapter, skipping skills injection');
      return;
    }
    fs.mkdirSync(baseDir, { recursive: true });

    for (const skill of skills) {
      const targetDir = skill.subfolder
        ? path.join(baseDir, skill.subfolder)
        : baseDir;
      fs.mkdirSync(targetDir, { recursive: true });

      const filePath = path.join(targetDir, skill.filename);

      if (fs.existsSync(filePath)) {
        const existing = fs.readFileSync(filePath, 'utf8');
        if (this.contentHash(existing) === this.contentHash(skill.content)) {
          log.debug(`Skipping unchanged skill: ${filePath}`);
          continue;
        }
      }

      this.atomicWrite(filePath, skill.content);
      log.info(`Injected skill: ${filePath}`);
    }
  }

  async injectSDD(configDir: string, agents: SDDAgentFile[]): Promise<void> {
    const baseDir = this.agentsDir();
    if (!baseDir) {
      log.warn('agentsDir is empty for CursorAdapter, skipping SDD injection');
      return;
    }
    fs.mkdirSync(baseDir, { recursive: true });

    for (const agent of agents) {
      const filePath = path.join(baseDir, `${agent.phase}.md`);

      if (fs.existsSync(filePath)) {
        const existing = fs.readFileSync(filePath, 'utf8');
        if (this.contentHash(existing) === this.contentHash(agent.content)) {
          log.debug(`Skipping unchanged SDD agent: ${filePath}`);
          continue;
        }
      }

      this.atomicWrite(filePath, agent.content);
      log.info(`Injected SDD agent: ${filePath}`);
    }
  }

  async injectMCPConfig(configDir: string, servers: MCPServerConfig[]): Promise<void> {
    const filePath = this.mcpConfigPath();
    let existing: Record<string, unknown> = {};

    if (fs.existsSync(filePath)) {
      try {
        existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch {
        log.warn(`Could not parse existing MCP config at ${filePath}, starting fresh.`);
        existing = {};
      }
    }

    const mcpServers: Record<string, Record<string, unknown>> = {};
    for (const server of servers) {
      const entry: Record<string, unknown> = { command: server.command };
      if (server.args && server.args.length > 0) entry.args = server.args;
      if (server.env && Object.keys(server.env).length > 0) entry.env = server.env;
      if (server.url) entry.url = server.url;
      mcpServers[server.name] = entry;
    }

    const merged = { ...existing, mcpServers: { ...(existing['mcpServers'] as Record<string, Record<string, unknown>> || {}), ...mcpServers } };
    this.atomicWrite(filePath, JSON.stringify(merged, null, 2) + '\n');
    log.info(`Injected MCP config into ${filePath}`);
  }

  async verify(configDir: string): Promise<VerifyReport> {
    const present: string[] = [];
    const missing: string[] = [];
    const warnings: string[] = [];

    const promptPath = this.systemPromptPath(configDir);
    if (fs.existsSync(promptPath)) {
      const content = fs.readFileSync(promptPath, 'utf8');
      if (content.includes(NINJA_MARKER_START)) {
        present.push(promptPath);
      } else {
        warnings.push(`${promptPath} exists but missing ninja:managed marker`);
      }
    } else {
      missing.push(promptPath);
    }

    const skills = this.skillsDir();
    if (fs.existsSync(skills)) {
      present.push(skills);
    } else {
      warnings.push(`Skills directory not found: ${skills}`);
    }

    const agents = this.agentsDir();
    if (fs.existsSync(agents)) {
      present.push(agents);
    } else {
      warnings.push(`SDD agents directory not found: ${agents}`);
    }

    const mcp = this.mcpConfigPath();
    if (fs.existsSync(mcp)) {
      present.push(mcp);
    } else {
      warnings.push(`MCP config not found: ${mcp}`);
    }

    return {
      passed: missing.length === 0,
      present,
      missing,
      warnings,
    };
  }

  private atomicWrite(filePath: string, content: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.ninja-tmp-${Date.now()}`;
    try {
      fs.writeFileSync(tmp, content, 'utf8');
      fs.renameSync(tmp, filePath);
    } catch (err) {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      throw err;
    }
  }

  private contentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async execute(prompt: string, options: AdapterOptions): Promise<AdapterResult> {
    const startTime = Date.now();
    try {
      const binary = options.executablePath || 'cursor';
      const args = options.args || [prompt];
      const fullCommand = `"${binary}" ${args.map(a => `"${a}"`).join(' ')}`;
      const output = execSync(fullCommand, {
        encoding: 'utf8',
        timeout: options.timeoutMs || 300000,
        maxBuffer: 10 * 1024 * 1024,
        stdio: 'pipe',
      });
      return {
        status: 'success',
        output: output.trim(),
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        status: err.killed ? 'timeout' : 'error',
        output: err.stderr?.toString() || err.message || 'Unknown error',
        durationMs: Date.now() - startTime,
      };
    }
  }
}