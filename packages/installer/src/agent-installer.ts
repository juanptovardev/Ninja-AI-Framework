import fs from 'fs';
import path from 'path';
import os from 'os';
import { createLogger } from '@ninja/logging';
import type { ClientConfig, ClientId } from '@ninja/roster';
import { detectClient, detectAllClients } from '@ninja/roster';
import { BackupManager } from './backup.js';
import { FileInjector } from './file-injector.js';
import { SkillsInstaller } from './skills-installer.js';
import { SDDInstaller } from './sdd-installer.js';
import { MCPInstaller } from './mcp-installer.js';
import { getSystemPromptForAgent, getSDDAgentFiles, getDefaultSkills, getDefaultPersona } from './content/index.js';
import { PersonaInstaller } from './persona-installer.js';
import { ArsenalBridge } from './arsenal-bridge.js';
import { AutoInstaller } from './auto-installer.js';
import type { ArsenalSnapshot } from '@ninja/arsenal-registry';
import type {
  NinjaSkill,
  SDDAgentFile,
  MCPServerConfig,
  InstallResult,
  SyncResult,
  UninstallResult,
  VerifyReport,
  NinjaPersona,
} from './types.js';

const log = createLogger('installer:agent-installer');

// ─── Built-in MCP servers that Ninja provides ─────────────────────────────────

const NINJA_MCP_SERVERS: MCPServerConfig[] = [
  {
    name: 'ninja-kage',
    command: 'node',
    args: [path.join(os.homedir(), '.ninja', 'mcp-bridge.js')],
    env: { NINJA_RUNTIME_URL: 'http://localhost:3141' },
  },
];

// ─── AgentInstaller ───────────────────────────────────────────────────────────

export interface InstallOptions {
  /** Whether to create a backup before modifying agent config files */
  backup?: boolean;
  /** Whether to run verification after installation */
  verify?: boolean;
  /** Custom skills to inject (in addition to defaults) */
  skills?: NinjaSkill[];
  /** Custom SDD agent files to inject (in addition to defaults) */
  sddAgents?: SDDAgentFile[];
  /** Custom MCP servers to inject (in addition to Ninja defaults) */
  mcpServers?: MCPServerConfig[];
  /** Custom system prompt override */
  systemPrompt?: string;
  /** Custom persona to inject (in addition to defaults) */
  persona?: NinjaPersona;
  /** Arsenal snapshot to bridge/sync skills */
  arsenalSnapshot?: ArsenalSnapshot;
}

/**
 * AgentInstaller — the central orchestrator of the Ninja injection pipeline.
 * Mirrors Gentle AI's install pipeline in internal/app/app.go.
 *
 * Pipeline (per agent):
 * 1. Detect → confirm agent is installed and locate config dir
 * 2. Backup → snapshot current config state
 * 3. Inject system prompt → CLAUDE.md / AGENTS.md / GEMINI.md
 * 4. Inject skills → {configDir}/skills/*.md
 * 5. Inject SDD agents → {configDir}/agents/sdd-*.md (full-delegation only)
 * 6. Inject MCP config → merge Ninja servers into agent's mcp config
 * 7. Verify → confirm files are in place
 */
export class AgentInstaller {
  private backupManager: BackupManager;
  private injector: FileInjector;
  private skillsInstaller: SkillsInstaller;
  private sddInstaller: SDDInstaller;
  private mcpInstaller: MCPInstaller;
  private personaInstaller: PersonaInstaller;

  constructor() {
    this.backupManager = new BackupManager();
    this.injector = new FileInjector();
    this.skillsInstaller = new SkillsInstaller();
    this.sddInstaller = new SDDInstaller();
    this.mcpInstaller = new MCPInstaller();
    this.personaInstaller = new PersonaInstaller();
  }

  /**
   * Installs Ninja into a specific agent.
   * Runs the full detect → backup → inject → verify pipeline.
   */
  async install(agentId: ClientId, options: InstallOptions = {}): Promise<InstallResult> {
    let config = detectClient(agentId);

    // Step 0: Auto-install if needed
    const autoInstaller = new AutoInstaller();
    if (!config && autoInstaller.canAutoInstall(agentId)) {
      try {
        log.info(`Agent ${agentId} is not installed. Attempting auto-installation...`);
        const autoResult = await autoInstaller.install(agentId);
        if (autoResult.success) {
          config = detectClient(agentId);
        } else {
          log.warn(`Auto-installation for ${agentId} failed: ${autoResult.output}`);
        }
      } catch (err: any) {
        log.warn(`Auto-installation for ${agentId} encountered an error: ${err.message}`);
      }
    }

    if (!config) {
      return {
        agentId,
        success: false,
        configDir: '',
        injected: [],
        skipped: [],
        errors: [`Agent ${agentId} is not installed on this system.`],
      };
    }

    log.info(`Installing Ninja into ${agentId} (${config.delegationModel}) at ${config.configDir}`);

    const result: InstallResult = {
      agentId,
      success: false,
      configDir: config.configDir,
      injected: [],
      skipped: [],
      errors: [],
    };

    // Step 1: Backup
    if (options.backup !== false && config.configDir) {
      try {
        result.backup = await this.backupManager.createBackup(
          agentId,
          config.configDir,
          `Pre-install backup for ninja install`
        );
      } catch (err: any) {
        log.warn(`Backup failed for ${agentId}: ${err.message}. Continuing without backup.`);
      }
    }

    try {
      // Step 2: Inject system prompt
      if (config.configDir) {
        const promptFile = this.getSystemPromptFile(config);
        const promptContent = options.systemPrompt || getSystemPromptForAgent(agentId, config.delegationModel);
        const written = this.injector.injectManagedBlock(promptFile, promptContent);
        if (written) result.injected.push(promptFile);
        else result.skipped.push(promptFile);
      }

      // Step 3: Inject skills
      if (config.skillsDir) {
        const skills = options.skills || ArsenalBridge.getInjectionSkills(options.arsenalSnapshot);
        const { injected, skipped } = this.skillsInstaller.install(config.skillsDir, skills);
        result.injected.push(...injected);
        result.skipped.push(...skipped);
      }

      // Step 3.5: Inject persona
      if (config.configDir) {
        const personaDir = path.join(config.configDir, 'persona');
        const persona = options.persona || getDefaultPersona();
        const { written, path: personaPath } = this.personaInstaller.install(personaDir, persona);
        if (written) result.injected.push(personaPath);
        else result.skipped.push(personaPath);
      }

      // Step 4: Inject SDD agents (full delegation only)
      if (config.agentsDir && config.delegationModel === 'full') {
        const agents = options.sddAgents || getSDDAgentFiles();
        const { injected, skipped } = this.sddInstaller.install(config.agentsDir, agents);
        result.injected.push(...injected);
        result.skipped.push(...skipped);
      }

      // Step 5: Inject MCP config
      if (config.mcpConfigPath) {
        const servers = [...NINJA_MCP_SERVERS, ...(options.mcpServers || [])];
        const format = this.getMCPFormat(agentId);
        const written = this.mcpInstaller.install(config.mcpConfigPath, servers, format);
        if (written) result.injected.push(config.mcpConfigPath);
        else result.skipped.push(config.mcpConfigPath);
      }

      result.success = true;
      log.info(`✓ Ninja installed into ${agentId}: ${result.injected.length} files written, ${result.skipped.length} unchanged`);

      // Step 6: Verify
      if (options.verify !== false) {
        result.verify = await this.verify(agentId);
      }
    } catch (err: any) {
      result.errors.push(err.message);
      result.success = false;
      log.error(`Installation failed for ${agentId}: ${err.message}`);

      // Rollback if backup was created
      if (result.backup && config.configDir) {
        log.info(`Rolling back ${agentId} to backup...`);
        try {
          await this.backupManager.restore(result.backup, config.configDir);
          log.info(`Rollback successful for ${agentId}`);
        } catch (rollbackErr: any) {
          log.error(`Rollback also failed for ${agentId}: ${rollbackErr.message}`);
        }
      }
    }

    return result;
  }

  /**
   * Installs Ninja into all detected agents on the system.
   * Parallel detection, sequential installation.
   */
  async installAll(options: InstallOptions = {}): Promise<InstallResult[]> {
    const detected = detectAllClients();
    const results: InstallResult[] = [];

    for (const agentId of Object.keys(detected) as ClientId[]) {
      const result = await this.install(agentId, options);
      results.push(result);
    }

    const succeeded = results.filter(r => r.success).length;
    log.info(`Install complete: ${succeeded}/${results.length} agents configured`);
    return results;
  }

  /**
   * Syncs Ninja config files into an agent (re-inject only changed files).
   * Faster than install — no backup, uses content hash comparison.
   */
  async sync(agentId: ClientId, options: Omit<InstallOptions, 'backup'> = {}): Promise<SyncResult> {
    const config = detectClient(agentId);

    if (!config) {
      return { agentId, updated: [], unchanged: [], errors: [`Agent ${agentId} is not installed`] };
    }

    const result: SyncResult = { agentId, updated: [], unchanged: [], errors: [] };

    try {
      // Re-inject system prompt
      if (config.configDir) {
        const promptFile = this.getSystemPromptFile(config);
        const written = this.injector.injectManagedBlock(promptFile, options.systemPrompt || getSystemPromptForAgent(agentId, config.delegationModel));
        if (written) result.updated.push(promptFile);
        else result.unchanged.push(promptFile);
      }

      // Re-inject skills
      if (config.skillsDir) {
        const skills = options.skills || getDefaultSkills();
        const { injected, skipped } = this.skillsInstaller.install(config.skillsDir, skills);
        result.updated.push(...injected);
        result.unchanged.push(...skipped);
      }

      // Re-inject persona
      if (config.configDir) {
        const personaDir = path.join(config.configDir, 'persona');
        const persona = options.persona || getDefaultPersona();
        const { written, path: personaPath } = this.personaInstaller.install(personaDir, persona);
        if (written) result.updated.push(personaPath);
        else result.unchanged.push(personaPath);
      }

      // Re-inject SDD agents
      if (config.agentsDir && config.delegationModel === 'full') {
        const agents = options.sddAgents || getSDDAgentFiles();
        const { injected, skipped } = this.sddInstaller.install(config.agentsDir, agents);
        result.updated.push(...injected);
        result.unchanged.push(...skipped);
      }

      log.info(`Sync ${agentId}: ${result.updated.length} updated, ${result.unchanged.length} unchanged`);
    } catch (err: any) {
      result.errors.push(err.message);
    }

    return result;
  }

  /**
   * Removes Ninja config files from an agent.
   * Optionally restores from the most recent backup.
   */
  async uninstall(agentId: ClientId, restoreBackup = false): Promise<UninstallResult> {
    const config = detectClient(agentId);
    const result: UninstallResult = { agentId, removed: [], errors: [] };

    if (!config) {
      log.warn(`Agent ${agentId} not detected. Attempting cleanup anyway.`);
    }

    // Restore from backup if requested
    if (restoreBackup) {
      const backups = this.backupManager.listBackups(agentId);
      if (backups.length > 0 && config?.configDir) {
        try {
          await this.backupManager.restore(backups[0], config.configDir);
          result.backupRestored = true;
          log.info(`Restored ${agentId} from backup: ${backups[0].id}`);
          return result;
        } catch (err: any) {
          result.errors.push(`Backup restore failed: ${err.message}`);
        }
      }
    }

    if (!config) return result;

    try {
      // Remove managed block from system prompt file
      const promptFile = this.getSystemPromptFile(config);
      if (this.injector.removeManagedBlock(promptFile)) {
        result.removed.push(promptFile);
      }

      // Remove skills
      const skills = getDefaultSkills();
      const removedSkills = this.skillsInstaller.uninstall(config.skillsDir, skills);
      result.removed.push(...removedSkills);

      // Remove SDD agents
      if (config.agentsDir) {
        const removedSDD = this.sddInstaller.uninstall(config.agentsDir);
        result.removed.push(...removedSDD);
      }

      // Remove persona
      if (config.configDir) {
        const personaDir = path.join(config.configDir, 'persona');
        const removedPersona = this.personaInstaller.uninstall(personaDir);
        result.removed.push(...removedPersona);
      }

      log.info(`Uninstall ${agentId}: ${result.removed.length} files removed`);
    } catch (err: any) {
      result.errors.push(err.message);
    }

    return result;
  }

  /**
   * Verifies that Ninja config files are correctly in place for an agent.
   * Mirrors Gentle AI's verify command.
   */
  async verify(agentId: ClientId): Promise<VerifyReport> {
    const config = detectClient(agentId);

    if (!config) {
      return {
        agentId,
        passed: false,
        present: [],
        missing: [],
        warnings: [`Agent ${agentId} is not detected`],
      };
    }

    const present: string[] = [];
    const missing: string[] = [];
    const warnings: string[] = [];

    // Check system prompt file
    const promptFile = this.getSystemPromptFile(config);
    if (fs.existsSync(promptFile)) {
      const content = fs.readFileSync(promptFile, 'utf8');
      if (content.includes('ninja:managed')) {
        present.push(promptFile);
      } else {
        warnings.push(`${promptFile} exists but missing ninja:managed marker`);
      }
    } else {
      missing.push(promptFile);
    }

    // Check skills dir
    if (config.skillsDir && !fs.existsSync(config.skillsDir)) {
      warnings.push(`Skills directory not found: ${config.skillsDir}`);
    } else if (config.skillsDir) {
      present.push(config.skillsDir);
    }

    // Check persona file
    if (config.configDir) {
      const personaDir = path.join(config.configDir, 'persona');
      const personaFile = path.join(personaDir, 'ninja-persona.md');
      if (fs.existsSync(personaFile)) {
        present.push(personaFile);
      } else {
        missing.push(personaFile);
      }
    }

    // Check SDD agents dir (full delegation only)
    if (config.delegationModel === 'full' && config.agentsDir) {
      if (!fs.existsSync(config.agentsDir)) {
        warnings.push(`SDD agents directory not found: ${config.agentsDir}`);
      } else {
        present.push(config.agentsDir);
      }
    }

    return {
      agentId,
      passed: missing.length === 0,
      present,
      missing,
      warnings,
    };
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  private getSystemPromptFile(config: ClientConfig): string {
    // Each agent uses a different primary system prompt file
    switch (config.id) {
      case 'claude-code':
        return path.join(config.configDir, 'CLAUDE.md');
      case 'cursor':
        return path.join(config.configDir, 'rules', 'ninja-orchestrator.md');
      case 'codex':
        return path.join(config.configDir, 'instructions.md');
      case 'windsurf':
        return path.join(config.configDir, 'memories', 'ninja-orchestrator.md');
      case 'opencode':
      case 'kilocode':
        return config.configPath; // opencode.json — handled specially
      case 'gemini-cli':
      case 'antigravity-cli':
      case 'antigravity-2':
        return path.join(config.configDir, 'GEMINI.md');
      case 'kimi-code':
      case 'kiro-ide':
      case 'qwen-code':
      case 'openclaw':
      case 'trae':
        return path.join(config.configDir, 'AGENTS.md');
      default:
        return path.join(config.configDir, 'AGENTS.md');
    }
  }

  private getMCPFormat(agentId: ClientId): 'json' | 'toml' | 'opencode' {
    if (agentId === 'opencode' || agentId === 'kilocode') return 'opencode';
    if (agentId === 'codex') return 'toml';
    return 'json';
  }
}
