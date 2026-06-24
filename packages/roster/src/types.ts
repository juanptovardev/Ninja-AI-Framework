// ─── Client Identity ──────────────────────────────────────────────────────────

export type ClientId =
  | 'codex'
  | 'antigravity-2'
  | 'antigravity-cli'
  | 'claude-code'
  | 'opencode'
  | 'kilocode'
  | 'gemini-cli'
  | 'cursor'
  | 'vscode-copilot'
  | 'windsurf'
  | 'kimi-code'
  | 'kiro-ide'
  | 'qwen-code'
  | 'openclaw'
  | 'trae'
  | 'deepseek-tui'
  | 'pi';

export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'nvidia'
  | 'openrouter'
  | 'glm'
  | 'groq'
  | 'moonshot'
  | 'alibaba';

export type ClientRole = 'orchestrator' | 'sentinel' | 'worker';

// ─── Delegation Model (aligned with Gentle AI) ────────────────────────────────

/**
 * full: native sub-agent delegation — each SDD phase runs in an isolated
 *       context window. Ninja writes SDD agent files to the agent's agents dir.
 *
 * solo: all SDD phases run inline in the same conversation window.
 *       Vault/Engram provides cross-phase persistence.
 *
 * package-managed: the agent runtime installs packages that own the skill chain.
 */
export type DelegationModel = 'full' | 'solo' | 'package-managed';

// ─── Connection Types ─────────────────────────────────────────────────────────

export type ConnectionMethod =
  | { type: 'headless-cli'; command: string; flags: string[] }
  | { type: 'pty'; command: string; args: string[]; interactive: boolean }
  | { type: 'mcp-stdio'; command: string; args: string[] }
  | { type: 'mcp-http'; url: string }
  | { type: 'vsix-websocket'; extensionId: string; port: number };

export interface ClientCapability {
  name: string;
  score: number;
}

// ─── Client Config (enhanced with Gentle AI path fields) ─────────────────────

export interface ClientConfig {
  id: ClientId;
  name: string;
  type: 'gui' | 'cli' | 'api-only';

  /** Absolute path to the agent binary */
  executablePath: string;

  /** Absolute path to the agent's primary config file (legacy, kept for compat) */
  configPath: string;

  /**
   * Absolute path to the agent's global config DIRECTORY.
   * This is where Ninja writes system prompts, skills, SDD agents, etc.
   * Aligned with Gentle AI's GlobalConfigDir() concept.
   * Examples: ~/.claude, ~/.cursor, ~/.config/opencode, ~/.codex
   */
  configDir: string;

  /** Absolute path to the agent's MCP config file */
  mcpConfigPath: string;

  /**
   * Absolute path to the directory where skills files should be written.
   * Empty string = agent doesn't support file-based skills.
   */
  skillsDir: string;

  /**
   * Absolute path to the directory where SDD sub-agent files should be written.
   * Only meaningful for 'full' delegation model agents.
   * Empty string = agent doesn't support sub-agent files.
   */
  agentsDir: string;

  status: 'connected' | 'disconnected' | 'error';
  capabilities: ClientCapability[];
  assignedRole: ClientRole;

  /**
   * Delegation model — determines how the agent handles SDD phases.
   * Aligned with Gentle AI's delegation tier classification.
   */
  delegationModel: DelegationModel;

  connectionMethod: ConnectionMethod;
  subscription?: string;

  /**
   * Whether Ninja can attempt to auto-install this agent if it is
   * not detected on the system (CLI packages only; GUI installers
   * that require a browser or manual steps should be false).
   */
  supportsAutoInstall: boolean;

  /** The shell command to run to install the agent (only if supportsAutoInstall is true) */
  installCommand: string;

  /** URL to the download page or documentation for manual installation */
  installUrl: string;
}

// ─── Roster ───────────────────────────────────────────────────────────────────

export interface OrchestrationConfig {
  defaultOrchestrator: ClientId;
  defaultSentinel: ClientId;
  heartbeatIntervalMs: number;
}

export interface NinjaRoster {
  version: string;
  createdAt: string;
  updatedAt: string;
  roles: {
    orchestrator: ClientId;
    sentinel: ClientId;
    workers: ClientId[];
    alwaysOnFallback: ClientId | 'model-gateway';
  };
  clients: Record<ClientId, ClientConfig>;
  apiKeys: Record<ProviderId, string>;
  orchestration: OrchestrationConfig;
}
