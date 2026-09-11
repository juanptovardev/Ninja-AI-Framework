import type { ClientId, DelegationModel } from '@ninja/roster';

// ─── Skill Types ──────────────────────────────────────────────────────────────

export interface NinjaSkill {
  id: string;
  filename: string;
  content: string;
  /** Optional subdirectory within the agent's skills dir */
  subfolder?: string;
}

// ─── SDD Agent File Types ─────────────────────────────────────────────────────

export interface SDDAgentFile {
  /** SDD phase: sdd-explore | sdd-propose | sdd-spec | sdd-design | sdd-tasks | sdd-apply | sdd-verify | sdd-archive */
  phase: string;
  /** Agent file content (Markdown with optional YAML frontmatter) */
  content: string;
}

// ─── MCP Server Config ────────────────────────────────────────────────────────

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

// ─── Persona Types ─────────────────────────────────────────────────────────────

export interface NinjaPersona {
  /** Unique identifier (e.g. "senior-staff-engineer") */
  id: string;
  /** Display name (e.g. "Senior Staff Engineer") */
  name: string;
  /** Brief description of the persona's purpose */
  description: string;
  /** Tone of voice the agent should adopt */
  tone: 'professional' | 'casual' | 'technical' | 'friendly' | 'terse';
  /** Areas of expertise the agent should exhibit */
  expertise: string[];
  /** Behavioral constraints the agent must follow */
  constraints: string[];
}

// ─── Backup ───────────────────────────────────────────────────────────────────

export interface BackupManifest {
  id: string;
  agentId: ClientId;
  createdAt: string;
  backupPath: string;
  files: string[];
  description?: string;
}

// ─── Verify Report ────────────────────────────────────────────────────────────

export interface VerifyReport {
  agentId: ClientId;
  passed: boolean;
  present: string[];
  missing: string[];
  warnings: string[];
}

// ─── Install Result ───────────────────────────────────────────────────────────

export interface InstallResult {
  agentId: ClientId;
  success: boolean;
  configDir: string;
  injected: string[];
  skipped: string[];
  errors: string[];
  backup?: BackupManifest;
  verify?: VerifyReport;
}

export interface SyncResult {
  agentId: ClientId;
  updated: string[];
  unchanged: string[];
  errors: string[];
}

export interface UninstallResult {
  agentId: ClientId;
  removed: string[];
  errors: string[];
  backupRestored?: boolean;
}
