/**
 * @ninja/office-grid — types.ts
 * Tipos base para el sistema Office Grid pseudo-isométrico.
 */

import type { ID } from '@ninja/contracts';

// ---------------------------------------------------------------------------
// Agent Roles (11 agentes oficiales - Plan Maestro §13)
// ---------------------------------------------------------------------------

export const AgentRoles = [
  'Planner',
  'Planificator',
  'Librarian',
  'DB Architect',
  'Backend',
  'Connector',
  'Designer',
  'Tester',
  'Quality Gate',
  'Security',
  'Build Fixer',
] as const;

export type AgentRole = (typeof AgentRoles)[number];

// ---------------------------------------------------------------------------
// Agent Activities
// ---------------------------------------------------------------------------

export type AgentActivity = 'idle' | 'thinking' | 'working' | 'error' | 'offline' | 'blocked' | 'awaiting_approval';

// ---------------------------------------------------------------------------
// Departments (10 departamentos oficiales - Plan Maestro §13)
// ---------------------------------------------------------------------------

export const DepartmentIds = [
  'Planning',
  'Library & Knowledge',
  'Data',
  'Backend',
  'Integration',
  'Design',
  'Test',
  'Quality',
  'Security',
  'Recovery / Fix',
] as const;

export type DepartmentId = (typeof DepartmentIds)[number];

// ---------------------------------------------------------------------------
// Position in pseudo-isometric grid
// ---------------------------------------------------------------------------

export interface AgentPosition {
  x: number;
  y: number;
  z: number;
}

// ---------------------------------------------------------------------------
// Agent Node
// ---------------------------------------------------------------------------

export interface AgentNode {
  id: string;
  role: AgentRole;
  department: DepartmentId;
  status: AgentActivity;
  position: AgentPosition;
  currentTask?: string;
  tokenUsage?: number;
  sessionTime?: number;
  lastEvent?: string;
  lastEventAt?: Date;
  sentinelBlocked?: boolean;
  sentinelPolicyId?: string;
}

// ---------------------------------------------------------------------------
// Department
// ---------------------------------------------------------------------------

export interface Department {
  id: DepartmentId;
  name: string;
  agents: string[];
  position: AgentPosition;
}

// ---------------------------------------------------------------------------
// Office State
// ---------------------------------------------------------------------------

export interface OfficeState {
  agents: Record<string, AgentNode>;
  departments: Record<DepartmentId, Department>;
  connectionState: 'connected' | 'reconnecting' | 'disconnected';
  lastSync: Date | null;
  isLoading: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Office Reducer Actions
// ---------------------------------------------------------------------------

export type OfficeAction =
  | { type: 'AGENT_STATUS_UPDATED'; agentId: string; activity: AgentActivity; task?: string }
  | { type: 'AGENT_TOKEN_UPDATED'; agentId: string; tokens: number }
  | { type: 'AGENT_BLOCKED'; agentId: string; reason: string; policyId: string }
  | { type: 'VAULT_IO_ACTIVITY'; agentId: string; layers: string[]; totalTokens: number }
  | { type: 'FULL_SYNC'; agents: Record<string, AgentNode> }
  | { type: 'CONNECTION_CHANGED'; connectionState: OfficeState['connectionState']; error?: string }
  | { type: 'SYNC_TICK' };

// ---------------------------------------------------------------------------
// Office Events (Discriminated Union — legacy WS format)
// ---------------------------------------------------------------------------

export type OfficeEvent =
  | {
      type: 'agent.status.updated';
      payload: { agentId: string; activity: AgentActivity; task?: string };
    }
  | { type: 'agent.token.updated'; payload: { agentId: string; tokens: number } }
  | { type: 'agent.task.started'; payload: AgentRuntimeEventPayload }
  | { type: 'agent.task.completed'; payload: AgentRuntimeEventPayload }
  | { type: 'agent.task.failed'; payload: AgentRuntimeEventPayload }
  | { type: 'agent.instance.created'; payload: AgentRuntimeEventPayload }
  | { type: 'agent.instance.paused'; payload: AgentRuntimeEventPayload }
  | { type: 'agent.instance.resumed'; payload: AgentRuntimeEventPayload }
  | { type: 'agent.instance.stopped'; payload: AgentRuntimeEventPayload }
  | { type: 'agent.llm.called'; payload: AgentRuntimeEventPayload }
  | { type: 'sentinel.action.blocked'; payload: SentinelBlockedWSPayload }
  | { type: 'sentinel.approval.requested'; payload: SentinelApprovalWSPayload }
  | { type: 'vault.query.executed'; payload: VaultQueryWSPayload }
  | { type: 'vault.write.executed'; payload: VaultWriteWSPayload }
  | { type: 'office.sync'; payload: { agents: AgentNode[] } }
  | { type: 'system.health'; payload: { status: string } };

// ---------------------------------------------------------------------------
// WS Event Payloads (from backend NinjaEvents)
// ---------------------------------------------------------------------------

export interface AgentRuntimeEventPayload {
  agentInstanceId: string;
  agentDefinitionId: string;
  role: string;
  status: string;
  data?: Record<string, unknown>;
}

export interface SentinelBlockedWSPayload {
  agentId: string;
  runId: string;
  actionType: string;
  reason: string;
  policyId: string;
}

export interface SentinelApprovalWSPayload {
  approvalId: string;
  runId: string;
  agentId: string;
  actionType: string;
  actionSummary: string;
  technicalDetails: string;
  policyId: string;
  requestedAt: string;
}

export interface VaultQueryWSPayload {
  agentId: string;
  sessionId: string;
  layers: string[];
  totalTokens: number;
  duration: number;
}

export interface VaultWriteWSPayload {
  agentId: string;
  sessionId: string;
  layer: string;
  tokenCount: number;
}

// ---------------------------------------------------------------------------
// Office Configuration
// ---------------------------------------------------------------------------

export interface OfficeConfig {
  wsUrl: string;
  reconnectIntervalMs: number;
  syncIntervalMs: number;
}
