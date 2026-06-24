import type { ClientId } from '@ninja/roster';
import type { NinjaPersona } from '@ninja/installer';
import os from 'os';

// ─── Execution Types ──────────────────────────────────────────────────────────

export interface AdapterOptions {
  taskId: string;
  executablePath?: string;
  args?: string[];
  flags?: string[];
  timeoutMs?: number;
  clientId?: string;
}

export interface AdapterResult {
  status: 'success' | 'error' | 'timeout';
  output: string;
  rawOutput?: any;
  durationMs: number;
}

// ─── Detection Types (aligned with Gentle AI) ────────────────────────────────

export interface DetectionResult {
  /** Whether the binary is installed and callable */
  installed: boolean;
  /** Absolute path to the binary if found */
  binaryPath: string;
  /** Absolute path to the agent's global config directory */
  configDir: string;
  /** True if configDir exists on disk (i.e. agent has been initialized before) */
  configFound: boolean;
  /** Error if detection itself failed */
  error?: Error;
}

// ─── Delegation Model (aligned with Gentle AI delegation tiers) ───────────────

/**
 * full: agent supports native sub-agent delegation — SDD phases run in
 *       isolated context windows. Gentle writes SDD phase files to the
 *       agent's agents directory.
 *
 * solo: all SDD phases run inline in the same conversation.
 *       Engram/Vault provides cross-phase persistence.
 *
 * package-managed: agent runtime installs packages that own the skill chain
 *                  (e.g. Pi).
 */
export type DelegationModel = 'full' | 'solo' | 'package-managed';

// ─── Injection Input Types ────────────────────────────────────────────────────

export interface NinjaSkill {
  /** Skill identifier (e.g. "sdd-orchestrator") */
  id: string;
  /** File name to write (e.g. "sdd-orchestrator.md") */
  filename: string;
  /** Skill content (Markdown) */
  content: string;
  /** Optional subfolder inside the skills dir (e.g. "sdd") */
  subfolder?: string;
}

export interface SDDAgentFile {
  /** Phase name — used for filename (e.g. "sdd-explore" → sdd-explore.md) */
  phase: string;
  /** Agent file content (Markdown with optional YAML frontmatter) */
  content: string;
}

export interface MCPServerConfig {
  /** Server name as it will appear in the agent's MCP config */
  name: string;
  /** How to launch the server */
  command: string;
  /** Arguments to the command */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** For HTTP-based MCP servers */
  url?: string;
}

export interface VerifyReport {
  /** Whether verification passed overall */
  passed: boolean;
  /** List of files that are present */
  present: string[];
  /** List of files that are missing */
  missing: string[];
  /** Warnings (non-fatal) */
  warnings: string[];
}

// ─── Core Adapter Interface (aligned with Gentle AI) ─────────────────────────

/**
 * IClientAdapter is the core abstraction for AI agent integration.
 * It mirrors Gentle AI's internal/agents.Adapter Go interface, adapted for
 * TypeScript and Ninja's execution model.
 *
 * Every adapter must implement:
 * 1. Identity — who this adapter represents
 * 2. Detection — can we find the agent + its config dir on disk?
 * 3. Config path resolution — where to write config files
 * 4. Delegation model — can this agent delegate to sub-agents?
 * 5. Injection — write system prompt, skills, SDD agents, MCP config
 * 6. Execution — call the agent with a prompt (Ninja-specific)
 * 7. Verification — confirm injected files are in place
 */
export interface IClientAdapter {
  // ── 1. Identity ──────────────────────────────────────────────────────────
  /** Returns the ClientId of this adapter */
  agentId(): ClientId;

  /** Returns the human-readable name */
  displayName(): string;

  /** Returns the delegation model for this agent */
  delegationModel(): DelegationModel;

  // ── 2. Detection ──────────────────────────────────────────────────────────
  /**
   * Detects whether this agent is installed on the system.
   * Checks binary availability and config directory existence.
   * Pure filesystem check — no subprocess spawning.
   */
  detect(homeDir?: string): Promise<DetectionResult>;

  // ── 3. Config Path Resolution ─────────────────────────────────────────────
  /**
   * Returns the absolute path to the agent's global config directory.
   * Examples: ~/.claude, ~/.cursor, ~/.config/opencode
   * Returns empty string if the agent has no file-based config.
   */
  globalConfigDir(homeDir?: string): string;

  /**
   * Returns the path to the directory where skills files should be written.
   * Examples: ~/.claude/skills, ~/.cursor/skills
   * Returns empty string if the agent doesn't support skills files.
   */
  skillsDir(homeDir?: string): string;

  /**
   * Returns the path to the directory where SDD agent files should be written.
   * Examples: ~/.cursor/agents, ~/.claude/agents (not standard — uses Task tool)
   * Returns empty string if the agent doesn't support agent files.
   */
  agentsDir(homeDir?: string): string;

  /**
   * Returns the path to the agent's MCP config file.
   * Examples: ~/.claude.json (within claude dir), ~/.cursor/mcp.json
   */
  mcpConfigPath(homeDir?: string): string;

  // ── 4. Injection ──────────────────────────────────────────────────────────
  /**
   * Writes the Ninja/SDD orchestrator system prompt into the agent's
   * primary system prompt file (e.g. CLAUDE.md, AGENTS.md).
   * Creates the file if it doesn't exist; merges markers if it does.
   */
  injectSystemPrompt(configDir: string, content: string): Promise<void>;

  /**
   * Writes skill files into the agent's skills directory.
   * Skips files that are already up-to-date (content hash match).
   */
  injectSkills(configDir: string, skills: NinjaSkill[]): Promise<void>;

  /**
   * Writes SDD phase agent files into the agent's agents directory.
   * Only applies to agents with delegationModel() === 'full'.
   * No-op for solo-agent adapters.
   */
  injectSDD(configDir: string, agents: SDDAgentFile[]): Promise<void>;

  /**
   * Merges MCP server configurations into the agent's MCP config file.
   * Uses a marker-based approach to avoid clobbering user settings.
   */
  injectMCPConfig(configDir: string, servers: MCPServerConfig[]): Promise<void>;

  /**
   * Injects a persona definition into the agent's persona directory.
   * Creates configDir/persona/{persona.id}.md with the persona template.
   */
  injectPersona(configDir: string, persona: NinjaPersona): Promise<void>;

  // ── 5. Execution (Ninja-specific) ─────────────────────────────────────────
  /**
   * Calls the agent with a prompt and returns the result.
   * This is Ninja's execution model — Gentle AI does not have this.
   */
  execute(prompt: string, options: AdapterOptions): Promise<AdapterResult>;

  // ── 6. Verification ───────────────────────────────────────────────────────
  /**
   * Verifies that expected Ninja files are present in the agent's config dir.
   * Returns a VerifyReport listing present, missing, and warning items.
   */
  verify(configDir: string): Promise<VerifyReport>;
}
