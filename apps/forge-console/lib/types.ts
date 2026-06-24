// Types for Forge Console pages
// These will be moved to @ninja/contracts in future iterations

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';
export type SystemState = 'idle' | 'running' | 'paused' | 'error';
export type FindingType = 'warning' | 'error' | 'info';

export interface TaskEntry {
  id: string;
  name: string;
  status: TaskStatus;
  agent?: string;
  timestamp: number;
}

export interface SystemStatus {
  runsActive: number;
  agentsActive: number;
  systemState: SystemState;
  recentTasks: TaskEntry[];
}


export interface Finding {
  id: string;
  type: FindingType;
  message: string;
  timestamp: number;
}

export interface HealthStatus {
  stabilityScore: number;
  contextEfficiency: number;
  findings: Finding[];
  uptime: number;
  lastCheck: number;
}

export interface IntakeTask {
  id: string;
  name: string;
  agent: string;
  dependencies: string[];
  status: 'pending';
}

export interface IntakeResponse {
  mode: 'build' | 'repair' | 'template' | 'workspace';
  tasks: IntakeTask[];
  estimatedTokens: number;
}

// ─── Settings Types ─────────────────────────────────────────────

export type ProviderType = 'openai' | 'anthropic' | 'ollama' | 'openrouter' | 'groq' | 'custom';

export interface LLMProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  models: string[];
  isActive: boolean;
}

export interface WorkspaceSettings {
  name: string;
  path: string;
  createdAt: string | number;
  lastAccessed: string | number;
}

// ─── Dashboard Types ─────────────────────────────────────────────

export interface DashboardData {
  systemState: SystemState;
  runsActive: number;
  agentsActive: number;
  pendingApprovals: number;
  recentTasks: TaskEntry[];
  pulse: PulseData | null;
  uptime: number;
  version: string;
}

export interface PulseData {
  stabilityScore: number;
  contextEfficiency: number;
  findings: Finding[];
  uptime: number;
  lastCheck: number;
  agentMetrics?: {
    activeCount: number;
    totalCount: number;
  };
  tokenMetrics?: {
    used: number;
    budget: number;
  };
}
