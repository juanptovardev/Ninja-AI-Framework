/**
 * @ninja/office-grid — Pure grid/state logic.
 *
 * Lógica pura extraída de los componentes (.tsx) para test sin render DOM.
 * Los componentes importan desde aquí (fuente única).
 */

import type {
  AgentActivity,
  AgentNode,
  AgentPosition,
  AgentRole,
  Department,
  DepartmentId,
  OfficeAction,
  OfficeState,
} from './types';

// ---------------------------------------------------------------------------
// Connection maps (office-canvas)
// ---------------------------------------------------------------------------

export const CONNECTION_COLORS: Record<OfficeState['connectionState'], string> = {
  connected: '#10b981',
  reconnecting: '#f59e0b',
  disconnected: '#ef4444',
};

export const CONNECTION_LABELS: Record<OfficeState['connectionState'], string> = {
  connected: 'Connected',
  reconnecting: 'Reconnecting...',
  disconnected: 'Disconnected',
};

export function isReconnecting(state: OfficeState['connectionState']): boolean {
  return state === 'reconnecting';
}

export function isDisconnected(state: OfficeState['connectionState']): boolean {
  return state === 'disconnected';
}

export function formatLastSync(date: Date | null): string {
  if (!date) return '--:--:--';
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Formatting helpers (office-canvas detail panel, agent-card)
// ---------------------------------------------------------------------------

export function formatSessionClock(seconds: number | undefined): string {
  if (!seconds) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const hours = Math.floor(mins / 60);
  if (hours > 0) {
    return `${hours}:${(mins % 60).toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatCardSessionTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function formatEventDate(date: Date | undefined): string {
  if (!date) return 'N/A';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function isAwaitingApproval(agent: Pick<AgentNode, 'status'>): boolean {
  return agent.status === 'awaiting_approval';
}

// ---------------------------------------------------------------------------
// Activity maps (state-indicators)
// ---------------------------------------------------------------------------

export const ACTIVITY_COLORS: Record<string, string> = {
  idle: '#64748b',
  thinking: '#22d3ee',
  working: '#10b981',
  error: '#ef4444',
  offline: '#1e293b',
  blocked: '#f59e0b',
};

export const ACTIVITY_LABELS: Record<AgentActivity, string> = {
  idle: 'Idle',
  thinking: 'Thinking',
  working: 'Working',
  error: 'Error',
  offline: 'Offline',
  blocked: 'Blocked',
  awaiting_approval: 'Awaiting Approval',
};

export const ACTIVITY_BADGE_STYLES: Record<AgentActivity, string> = {
  idle: 'bg-gray-500 text-gray-200',
  thinking: 'bg-cyan-400 text-cyan-100',
  working: 'bg-green-500 text-green-100',
  error: 'bg-red-500 text-red-100',
  offline: 'bg-gray-800 text-gray-400',
  blocked: 'bg-amber-500 text-amber-100',
  awaiting_approval: 'bg-purple-500 text-purple-100',
};

export const ACTIVITY_PULSE_COLORS: Record<AgentActivity, string> = {
  idle: 'bg-gray-500',
  thinking: 'bg-cyan-400',
  working: 'bg-green-500',
  error: 'bg-red-500',
  offline: 'bg-gray-800',
  blocked: 'bg-amber-500',
  awaiting_approval: 'bg-purple-500',
};

export function shouldPulse(activity: AgentActivity): boolean {
  return activity === 'thinking' || activity === 'working' || activity === 'awaiting_approval';
}

export const ROLE_AVATAR_COLORS: Record<string, string> = {
  Planner: 'bg-blue-500',
  Planificator: 'bg-indigo-500',
  Librarian: 'bg-purple-500',
  'DB Architect': 'bg-rose-500',
  Backend: 'bg-amber-500',
  Connector: 'bg-emerald-500',
  Designer: 'bg-pink-500',
  Tester: 'bg-teal-500',
  'Quality Gate': 'bg-violet-500',
  Security: 'bg-cyan-500',
  'Build Fixer': 'bg-orange-500',
};

export const AVATAR_SIZE_CLASSES = {
  sm: 'h-6 w-6 text-xs',
  md: 'h-8 w-8 text-sm',
  lg: 'h-10 w-10 text-base',
} as const;

export type AvatarSize = keyof typeof AVATAR_SIZE_CLASSES;

export function agentInitials(role: AgentRole): string {
  return role
    .split(' ')
    .map((word) => word[0])
    .join('')
    .substring(0, 2);
}

export function avatarColorFor(role: string): string {
  return ROLE_AVATAR_COLORS[role] ?? 'bg-gray-500';
}

// ---------------------------------------------------------------------------
// Department maps (departments)
// ---------------------------------------------------------------------------

export const DEPARTMENT_COLORS: Record<DepartmentId, string> = {
  Planning: '#818cf8',
  'Library & Knowledge': '#f59e0b',
  Data: '#22d3ee',
  Backend: '#3b82f6',
  Integration: '#a78bfa',
  Design: '#ec4899',
  Test: '#10b981',
  Quality: '#14b8a6',
  Security: '#ef4444',
  'Recovery / Fix': '#f97316',
};

export function departmentAccent(id: string): string {
  return (DEPARTMENT_COLORS as Record<string, string>)[id] ?? '#64748b';
}

export function isGuardianDesk(id: DepartmentId): boolean {
  return id === 'Security';
}

// ---------------------------------------------------------------------------
// Grid calculations
// ---------------------------------------------------------------------------

/** Pseudo-isometric projection: grid (x, y, z) -> screen (sx, sy). */
export function projectIso(pos: AgentPosition, tileW = 64, tileH = 32): { sx: number; sy: number } {
  return {
    sx: (pos.x - pos.y) * (tileW / 2),
    sy: (pos.x + pos.y) * (tileH / 2) - pos.z * tileH,
  };
}

/** Manhattan distance on the grid plane (layout heuristic). */
export function gridDistance(a: AgentPosition, b: AgentPosition): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
}

export function agentsInDepartment(
  department: Pick<Department, 'agents'>,
  agents: Record<string, AgentNode>
): AgentNode[] {
  return department.agents
    .map((id) => agents[id])
    .filter((agent): agent is AgentNode => agent !== undefined);
}

export function countByStatus(agents: Record<string, AgentNode>, status: AgentActivity): number {
  return Object.values(agents).filter((a) => a.status === status).length;
}

export function totalTokenUsage(agents: Record<string, AgentNode>): number {
  return Object.values(agents).reduce((sum, a) => sum + (a.tokenUsage ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Pure office reducer (mirrors the WS-event transitions of use-office-state)
// ---------------------------------------------------------------------------

export function officeReducer(state: OfficeState, action: OfficeAction): OfficeState {
  switch (action.type) {
    case 'AGENT_STATUS_UPDATED': {
      const agent = state.agents[action.agentId];
      if (!agent) return state;
      return {
        ...state,
        agents: {
          ...state.agents,
          [action.agentId]: {
            ...agent,
            status: action.activity,
            currentTask: action.task,
            lastEvent: 'status.updated',
            lastEventAt: new Date(),
          },
        },
      };
    }
    case 'AGENT_TOKEN_UPDATED': {
      const agent = state.agents[action.agentId];
      if (!agent) return state;
      return {
        ...state,
        agents: {
          ...state.agents,
          [action.agentId]: {
            ...agent,
            tokenUsage: action.tokens,
            lastEvent: 'token.updated',
            lastEventAt: new Date(),
          },
        },
      };
    }
    case 'AGENT_BLOCKED': {
      const agent = state.agents[action.agentId];
      if (!agent) return state;
      return {
        ...state,
        agents: {
          ...state.agents,
          [action.agentId]: {
            ...agent,
            status: 'blocked',
            sentinelBlocked: true,
            sentinelPolicyId: action.policyId,
            lastEvent: 'sentinel.blocked',
            lastEventAt: new Date(),
          },
        },
      };
    }
    case 'VAULT_IO_ACTIVITY': {
      const agent = state.agents[action.agentId];
      if (!agent) return state;
      return {
        ...state,
        agents: {
          ...state.agents,
          [action.agentId]: {
            ...agent,
            tokenUsage: (agent.tokenUsage ?? 0) + action.totalTokens,
            lastEvent: `vault.io:${action.layers.join('+')}`,
            lastEventAt: new Date(),
          },
        },
      };
    }
    case 'FULL_SYNC': {
      return { ...state, agents: { ...action.agents }, lastSync: new Date() };
    }
    case 'CONNECTION_CHANGED': {
      return {
        ...state,
        connectionState: action.connectionState,
        error: action.error ?? (action.connectionState === 'connected' ? null : state.error),
      };
    }
    case 'SYNC_TICK': {
      return { ...state, lastSync: new Date() };
    }
    default:
      return state;
  }
}

/** Reconnection delay with exponential backoff (capped at 30s). */
export function reconnectDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, Math.max(0, attempt)), 30000);
}

/** Whether more reconnection attempts remain (max 3). */
export function canRetry(attempts: number, max = 3): boolean {
  return attempts < max;
}
