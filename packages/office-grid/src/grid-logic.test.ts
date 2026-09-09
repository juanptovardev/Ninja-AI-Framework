import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_BADGE_STYLES,
  ACTIVITY_COLORS,
  ACTIVITY_LABELS,
  ACTIVITY_PULSE_COLORS,
  AVATAR_SIZE_CLASSES,
  CONNECTION_COLORS,
  CONNECTION_LABELS,
  DEPARTMENT_COLORS,
  agentInitials,
  agentsInDepartment,
  avatarColorFor,
  canRetry,
  countByStatus,
  departmentAccent,
  formatCardSessionTime,
  formatEventDate,
  formatLastSync,
  formatSessionClock,
  gridDistance,
  isAwaitingApproval,
  isDisconnected,
  isGuardianDesk,
  isReconnecting,
  officeReducer,
  projectIso,
  reconnectDelay,
  ROLE_AVATAR_COLORS,
  shouldPulse,
  totalTokenUsage,
} from './grid-logic';
import { agentNodeSchema, officeEventSchema } from './schema';
import { AgentRoles, DepartmentIds } from './types';
import type { AgentNode, OfficeAction, OfficeState } from './types';

function makeAgent(over: Partial<AgentNode> = {}): AgentNode {
  return {
    id: 'agent-backend',
    role: 'Backend',
    department: 'Backend',
    status: 'idle',
    position: { x: 10, y: 50, z: 0 },
    tokenUsage: 100,
    ...over,
  };
}

function makeState(over: Partial<OfficeState> = {}): OfficeState {
  const agent = makeAgent();
  return {
    agents: { [agent.id]: agent },
    departments: {
      Planning: { id: 'Planning', name: 'Planning', agents: [], position: { x: 0, y: 0, z: 0 } },
      'Library & Knowledge': {
        id: 'Library & Knowledge',
        name: 'L&K',
        agents: [],
        position: { x: 0, y: 0, z: 0 },
      },
      Data: { id: 'Data', name: 'Data', agents: [], position: { x: 0, y: 0, z: 0 } },
      Backend: {
        id: 'Backend',
        name: 'Backend',
        agents: [agent.id],
        position: { x: 0, y: 0, z: 0 },
      },
      Integration: {
        id: 'Integration',
        name: 'Integration',
        agents: [],
        position: { x: 0, y: 0, z: 0 },
      },
      Design: { id: 'Design', name: 'Design', agents: [], position: { x: 0, y: 0, z: 0 } },
      Test: { id: 'Test', name: 'Test', agents: [], position: { x: 0, y: 0, z: 0 } },
      Quality: { id: 'Quality', name: 'Quality', agents: [], position: { x: 0, y: 0, z: 0 } },
      Security: { id: 'Security', name: 'Security', agents: [], position: { x: 0, y: 0, z: 0 } },
      'Recovery / Fix': {
        id: 'Recovery / Fix',
        name: 'Recovery',
        agents: [],
        position: { x: 0, y: 0, z: 0 },
      },
    },
    connectionState: 'connected',
    lastSync: null,
    isLoading: false,
    error: null,
    ...over,
  };
}

describe('connection maps', () => {
  it('colors and labels for all states', () => {
    expect(CONNECTION_COLORS.connected).toBe('#10b981');
    expect(CONNECTION_COLORS.reconnecting).toBe('#f59e0b');
    expect(CONNECTION_COLORS.disconnected).toBe('#ef4444');
    expect(CONNECTION_LABELS.connected).toBe('Connected');
    expect(CONNECTION_LABELS.reconnecting).toBe('Reconnecting...');
    expect(CONNECTION_LABELS.disconnected).toBe('Disconnected');
  });
  it('connection predicates match their own state and reject the other', () => {
    expect(isReconnecting('reconnecting')).toBe(true);
    expect(isReconnecting('connected')).toBe(false);
    expect(isDisconnected('disconnected')).toBe(true);
    expect(isDisconnected('connected')).toBe(false);
  });
  it('formatLastSync handles null and dates', () => {
    expect(formatLastSync(null)).toBe('--:--:--');
    expect(formatLastSync(new Date('2026-01-01T10:20:30'))).toContain('10:20:30');
  });
});

describe('time formatters', () => {
  it('formatSessionClock with hours and without', () => {
    expect(formatSessionClock(undefined)).toBe('00:00');
    expect(formatSessionClock(0)).toBe('00:00');
    expect(formatSessionClock(90)).toBe('1:30');
    expect(formatSessionClock(3661)).toBe('1:01:01');
  });
  it('formatCardSessionTime is MM:SS padded', () => {
    expect(formatCardSessionTime(65)).toBe('01:05');
  });
  it('formatEventDate handles undefined', () => {
    expect(formatEventDate(undefined)).toBe('N/A');
    expect(formatEventDate(new Date('2026-01-05T10:00:00'))).toContain('Jan');
  });
  it('isAwaitingApproval is true only for the awaiting_approval status', () => {
    expect(isAwaitingApproval({ status: 'awaiting_approval' })).toBe(true);
    expect(isAwaitingApproval({ status: 'working' })).toBe(false);
  });
});

describe('activity maps', () => {
  it('labels cover all activities', () => {
    expect(ACTIVITY_LABELS.awaiting_approval).toBe('Awaiting Approval');
    expect(Object.keys(ACTIVITY_LABELS)).toHaveLength(7);
  });
  it('badge and pulse styles reference known classes', () => {
    expect(ACTIVITY_BADGE_STYLES.working).toContain('green-500');
    expect(ACTIVITY_PULSE_COLORS.error).toBe('bg-red-500');
  });
  it('shouldPulse only for active states', () => {
    expect(shouldPulse('thinking')).toBe(true);
    expect(shouldPulse('working')).toBe(true);
    expect(shouldPulse('awaiting_approval')).toBe(true);
    expect(shouldPulse('idle')).toBe(false);
    expect(shouldPulse('error')).toBe(false);
    expect(shouldPulse('blocked')).toBe(false);
    expect(shouldPulse('offline')).toBe(false);
  });
  it('avatar colors and initials', () => {
    expect(avatarColorFor('Security')).toBe('bg-cyan-500');
    expect(avatarColorFor('Unknown Role')).toBe('bg-gray-500');
    expect(agentInitials('DB Architect')).toBe('DA');
    expect(agentInitials('Quality Gate')).toBe('QG');
    expect(AVATAR_SIZE_CLASSES.md).toBe('h-8 w-8 text-sm');
  });
});

describe('department maps', () => {
  it('all 10 departments have colors', () => {
    expect(Object.keys(DEPARTMENT_COLORS)).toHaveLength(10);
    expect(DEPARTMENT_COLORS.Security).toBe('#ef4444');
  });
  it('departmentAccent falls back for unknown', () => {
    expect(departmentAccent('Planning')).toBe('#818cf8');
    expect(departmentAccent('nope')).toBe('#64748b');
  });
  it('isGuardianDesk only for Security', () => {
    expect(isGuardianDesk('Security')).toBe(true);
    expect(isGuardianDesk('Backend')).toBe(false);
  });
});

describe('grid calculations', () => {
  it('projectIso centers origin and lifts z', () => {
    expect(projectIso({ x: 0, y: 0, z: 0 })).toEqual({ sx: 0, sy: 0 });
    const p = projectIso({ x: 2, y: 0, z: 0 });
    expect(p.sx).toBe(64);
    expect(p.sy).toBe(32);
    const lifted = projectIso({ x: 0, y: 0, z: 1 });
    expect(lifted.sy).toBe(-32);
  });
  it('gridDistance is manhattan', () => {
    expect(gridDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 1 })).toBe(8);
  });
  it('agentsInDepartment skips missing ids', () => {
    const state = makeState();
    const list = agentsInDepartment({ agents: ['agent-backend', 'ghost'] }, state.agents);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('agent-backend');
  });
  it('countByStatus and totalTokenUsage aggregate', () => {
    const state = makeState({
      agents: {
        a: makeAgent({ id: 'a', status: 'working', tokenUsage: 10 }),
        b: makeAgent({ id: 'b', status: 'working', tokenUsage: 20 }),
        c: makeAgent({ id: 'c', status: 'idle', tokenUsage: undefined }),
      },
    });
    expect(countByStatus(state.agents, 'working')).toBe(2);
    expect(countByStatus(state.agents, 'idle')).toBe(1);
    expect(totalTokenUsage(state.agents)).toBe(30);
  });
});

describe('officeReducer', () => {
  it('AGENT_STATUS_UPDATED updates task and event', () => {
    const next = officeReducer(makeState(), {
      type: 'AGENT_STATUS_UPDATED',
      agentId: 'agent-backend',
      activity: 'working',
      task: 'build x',
    });
    expect(next.agents['agent-backend'].status).toBe('working');
    expect(next.agents['agent-backend'].currentTask).toBe('build x');
    expect(next.agents['agent-backend'].lastEvent).toBe('status.updated');
  });
  it('AGENT_STATUS_UPDATED on unknown agent is no-op', () => {
    const s = makeState();
    expect(
      officeReducer(s, { type: 'AGENT_STATUS_UPDATED', agentId: 'ghost', activity: 'working' })
    ).toBe(s);
  });
  it('AGENT_TOKEN_UPDATED sets tokens', () => {
    const next = officeReducer(makeState(), {
      type: 'AGENT_TOKEN_UPDATED',
      agentId: 'agent-backend',
      tokens: 999,
    });
    expect(next.agents['agent-backend'].tokenUsage).toBe(999);
    expect(next.agents['agent-backend'].lastEvent).toBe('token.updated');
  });
  it('AGENT_BLOCKED flags sentinel data', () => {
    const next = officeReducer(makeState(), {
      type: 'AGENT_BLOCKED',
      agentId: 'agent-backend',
      reason: 'policy',
      policyId: 'pol-1',
    });
    const a = next.agents['agent-backend'];
    expect(a.status).toBe('blocked');
    expect(a.sentinelBlocked).toBe(true);
    expect(a.sentinelPolicyId).toBe('pol-1');
  });
  it('VAULT_IO_ACTIVITY accumulates tokens with layer tag', () => {
    const next = officeReducer(makeState(), {
      type: 'VAULT_IO_ACTIVITY',
      agentId: 'agent-backend',
      layers: ['hot', 'warm'],
      totalTokens: 50,
    });
    expect(next.agents['agent-backend'].tokenUsage).toBe(150);
    expect(next.agents['agent-backend'].lastEvent).toBe('vault.io:hot+warm');
  });
  it('FULL_SYNC replaces agents and stamps sync', () => {
    const other = makeAgent({ id: 'x', role: 'Tester' });
    const next = officeReducer(makeState(), { type: 'FULL_SYNC', agents: { x: other } });
    expect(Object.keys(next.agents)).toEqual(['x']);
    expect(next.lastSync).toBeInstanceOf(Date);
  });
  it('CONNECTION_CHANGED clears error on connect', () => {
    const s = makeState({ connectionState: 'disconnected', error: 'boom' });
    const next = officeReducer(s, { type: 'CONNECTION_CHANGED', connectionState: 'connected' });
    expect(next.connectionState).toBe('connected');
    expect(next.error).toBeNull();
  });
  it('CONNECTION_CHANGED keeps error when provided', () => {
    const next = officeReducer(makeState(), {
      type: 'CONNECTION_CHANGED',
      connectionState: 'disconnected',
      error: 'lost',
    });
    expect(next.error).toBe('lost');
  });
  it('SYNC_TICK stamps lastSync', () => {
    expect(officeReducer(makeState(), { type: 'SYNC_TICK' }).lastSync).toBeInstanceOf(Date);
  });
});

describe('reconnect helpers', () => {
  it('reconnectDelay backs off and caps at 30s', () => {
    expect(reconnectDelay(0)).toBe(1000);
    expect(reconnectDelay(1)).toBe(2000);
    expect(reconnectDelay(10)).toBe(30000);
    expect(reconnectDelay(-1)).toBe(1000);
  });
  it('canRetry allows up to 3 attempts', () => {
    expect(canRetry(0)).toBe(true);
    expect(canRetry(2)).toBe(true);
    expect(canRetry(3)).toBe(false);
  });
});

describe('schemas', () => {
  it('agentNodeSchema accepts a valid node', () => {
    const parsed = agentNodeSchema.safeParse({
      id: 'a1',
      role: 'Backend',
      department: 'Backend',
      status: 'working',
      position: { x: 1, y: 2, z: 0 },
    });
    expect(parsed.success).toBe(true);
  });
  it('agentNodeSchema rejects unknown role', () => {
    const parsed = agentNodeSchema.safeParse({
      id: 'a1',
      role: 'Ninja',
      department: 'Backend',
      status: 'working',
      position: { x: 1, y: 2, z: 0 },
    });
    expect(parsed.success).toBe(false);
  });
  it('officeEventSchema parses status/token/sync/health events', () => {
    expect(
      officeEventSchema.safeParse({
        type: 'agent.status.updated',
        payload: { agentId: 'a', activity: 'working', task: 't' },
      }).success
    ).toBe(true);
    expect(
      officeEventSchema.safeParse({
        type: 'agent.token.updated',
        payload: { agentId: 'a', tokens: 5 },
      }).success
    ).toBe(true);
    expect(
      officeEventSchema.safeParse({
        type: 'office.sync',
        payload: {
          agents: [
            {
              id: 'a',
              role: 'Backend',
              department: 'Backend',
              status: 'idle',
              position: { x: 0, y: 0, z: 0 },
            },
          ],
        },
      }).success
    ).toBe(true);
    expect(
      officeEventSchema.safeParse({ type: 'system.health', payload: { status: 'ok' } }).success
    ).toBe(true);
  });
  it('officeEventSchema rejects unknown event type', () => {
    expect(officeEventSchema.safeParse({ type: 'nope', payload: {} }).success).toBe(false);
  });
});

describe('type registries', () => {
  it('11 agent roles and 10 departments', () => {
    expect(AgentRoles).toHaveLength(11);
    expect(DepartmentIds).toHaveLength(10);
  });
  it('registries contain the guardian and recovery entries', () => {
    expect(AgentRoles).toContain('Security');
    expect(AgentRoles).toContain('Build Fixer');
    expect(DepartmentIds).toContain('Security');
    expect(DepartmentIds).toContain('Recovery / Fix');
  });
});

describe('activity dot colors (canvas fallback contract)', () => {
  it('covers the six pre-approval activities with distinct hexes', () => {
    expect(ACTIVITY_COLORS.idle).toBe('#64748b');
    expect(ACTIVITY_COLORS.thinking).toBe('#22d3ee');
    expect(ACTIVITY_COLORS.working).toBe('#10b981');
    expect(ACTIVITY_COLORS.error).toBe('#ef4444');
    expect(ACTIVITY_COLORS.offline).toBe('#1e293b');
    expect(ACTIVITY_COLORS.blocked).toBe('#f59e0b');
  });
  it('has no dot color for awaiting_approval — callers must fall back', () => {
    // Badge/pulse maps cover 7 activities, the dot map covers 6. Locked so a
    // future canvas dot for awaiting_approval is added deliberately, not by accident.
    expect(ACTIVITY_COLORS['awaiting_approval']).toBeUndefined();
    expect(ACTIVITY_BADGE_STYLES.awaiting_approval).toContain('purple-500');
    expect(ACTIVITY_PULSE_COLORS.awaiting_approval).toBe('bg-purple-500');
  });
});

describe('avatar and role tokens', () => {
  it('every official role has an avatar color', () => {
    expect(Object.keys(ROLE_AVATAR_COLORS)).toHaveLength(11);
    expect(avatarColorFor('Planner')).toBe('bg-blue-500');
    expect(avatarColorFor('Build Fixer')).toBe('bg-orange-500');
  });
  it('single-word roles yield a single initial', () => {
    expect(agentInitials('Backend')).toBe('B');
    expect(agentInitials('Tester')).toBe('T');
  });
  it('all avatar sizes map to Tailwind classes', () => {
    expect(AVATAR_SIZE_CLASSES.sm).toBe('h-6 w-6 text-xs');
    expect(AVATAR_SIZE_CLASSES.lg).toBe('h-10 w-10 text-base');
  });
});

describe('iso projection edge cases', () => {
  it('honors custom tile dimensions', () => {
    expect(projectIso({ x: 1, y: 0, z: 0 }, 100, 50)).toEqual({ sx: 50, sy: 25 });
  });
  it('y axis mirrors x on screen', () => {
    expect(projectIso({ x: 0, y: 2, z: 0 })).toEqual({ sx: -64, sy: 32 });
  });
  it('gridDistance is zero for the same cell and counts z', () => {
    expect(gridDistance({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 })).toBe(0);
    expect(gridDistance({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 2 })).toBe(2);
  });
});

describe('formatter boundaries', () => {
  it('formatSessionClock pads minutes inside the hour display', () => {
    expect(formatSessionClock(7320)).toBe('2:02:00');
  });
  it('formatCardSessionTime stays MM:SS past one hour (agent-card contract)', () => {
    expect(formatCardSessionTime(0)).toBe('00:00');
    expect(formatCardSessionTime(3661)).toBe('61:01');
  });
  it('connection predicates reject the third state', () => {
    expect(isReconnecting('disconnected')).toBe(false);
    expect(isDisconnected('reconnecting')).toBe(false);
  });
});

describe('officeReducer no-op and preservation contracts', () => {
  it('unknown action type returns the same state reference', () => {
    const s = makeState();
    expect(officeReducer(s, { type: 'UNKNOWN' } as unknown as OfficeAction)).toBe(s);
  });
  it('TOKEN, BLOCKED and VAULT updates on unknown agents are no-ops', () => {
    const s = makeState();
    expect(officeReducer(s, { type: 'AGENT_TOKEN_UPDATED', agentId: 'ghost', tokens: 5 })).toBe(s);
    expect(
      officeReducer(s, { type: 'AGENT_BLOCKED', agentId: 'ghost', reason: 'r', policyId: 'p' })
    ).toBe(s);
    expect(
      officeReducer(s, {
        type: 'VAULT_IO_ACTIVITY',
        agentId: 'ghost',
        layers: ['hot'],
        totalTokens: 5,
      })
    ).toBe(s);
  });
  it('CONNECTION_CHANGED to disconnected without error preserves the previous error', () => {
    const s = makeState({ connectionState: 'connected', error: 'stale' });
    const next = officeReducer(s, { type: 'CONNECTION_CHANGED', connectionState: 'disconnected' });
    expect(next.connectionState).toBe('disconnected');
    expect(next.error).toBe('stale');
  });
  it('CONNECTION_CHANGED to reconnecting without error preserves the previous error', () => {
    const s = makeState({ connectionState: 'connected', error: 'stale' });
    const next = officeReducer(s, { type: 'CONNECTION_CHANGED', connectionState: 'reconnecting' });
    expect(next.error).toBe('stale');
  });
  it('FULL_SYNC preserves connection state while replacing agents', () => {
    const s = makeState({ connectionState: 'reconnecting' });
    const other = makeAgent({ id: 'y', role: 'Designer' });
    const next = officeReducer(s, { type: 'FULL_SYNC', agents: { y: other } });
    expect(next.connectionState).toBe('reconnecting');
    expect(next.agents['y'].role).toBe('Designer');
  });
  it('SYNC_TICK preserves the agent map', () => {
    const s = makeState();
    expect(officeReducer(s, { type: 'SYNC_TICK' }).agents).toEqual(s.agents);
  });
  it('AGENT_STATUS_UPDATED without task clears a stale currentTask', () => {
    const s = makeState({ agents: { 'agent-backend': makeAgent({ currentTask: 'old' }) } });
    const next = officeReducer(s, {
      type: 'AGENT_STATUS_UPDATED',
      agentId: 'agent-backend',
      activity: 'idle',
    });
    expect(next.agents['agent-backend'].currentTask).toBeUndefined();
  });
  it('VAULT_IO_ACTIVITY with a single layer tags without "+"', () => {
    const next = officeReducer(makeState(), {
      type: 'VAULT_IO_ACTIVITY',
      agentId: 'agent-backend',
      layers: ['cold'],
      totalTokens: 10,
    });
    expect(next.agents['agent-backend'].lastEvent).toBe('vault.io:cold');
    expect(next.agents['agent-backend'].tokenUsage).toBe(110);
  });
  it('AGENT_BLOCKED records the sentinel event tag', () => {
    const next = officeReducer(makeState(), {
      type: 'AGENT_BLOCKED',
      agentId: 'agent-backend',
      reason: 'policy',
      policyId: 'pol-1',
    });
    expect(next.agents['agent-backend'].lastEvent).toBe('sentinel.blocked');
  });
});

describe('reconnect policy', () => {
  it('canRetry honors a custom max', () => {
    expect(canRetry(3, 5)).toBe(true);
    expect(canRetry(5, 5)).toBe(false);
  });
  it('reconnectDelay doubles per attempt before the 30s cap', () => {
    expect(reconnectDelay(2)).toBe(4000);
    expect(reconnectDelay(3)).toBe(8000);
    expect(reconnectDelay(100)).toBe(30000);
  });
});

describe('aggregation edge cases', () => {
  it('countByStatus is zero on empty maps and totalTokenUsage handles empty', () => {
    const state = makeState({ agents: {} });
    expect(countByStatus(state.agents, 'working')).toBe(0);
    expect(totalTokenUsage(state.agents)).toBe(0);
  });
  it('agentsInDepartment returns empty for unknown-only lists', () => {
    const state = makeState();
    expect(agentsInDepartment({ agents: ['ghost'] }, state.agents)).toEqual([]);
  });
  it('departmentAccent falls back for empty string', () => {
    expect(departmentAccent('')).toBe('#64748b');
  });
});

describe('schema-vs-types divergence (locked contracts)', () => {
  it('agentNodeSchema still rejects blocked/awaiting_approval (schema allows 5 of 7 activities)', () => {
    // types.ts AgentActivity has 7 members; schema.ts status enum has 5. The hook
    // validates WS payloads with officeEventSchema, so blocked/approval transitions
    // arriving over WS are dropped at parse time. Locked here so the divergence is
    // fixed deliberately, not silently.
    for (const status of ['blocked', 'awaiting_approval'] as const) {
      const parsed = agentNodeSchema.safeParse({
        id: 'a1',
        role: 'Backend',
        department: 'Backend',
        status,
        position: { x: 0, y: 0, z: 0 },
      });
      expect(parsed.success).toBe(false);
    }
  });
  it('officeEventSchema rejects runtime task-lifecycle events the hook cannot handle', () => {
    expect(
      officeEventSchema.safeParse({
        type: 'agent.task.started',
        payload: {
          agentInstanceId: 'i',
          agentDefinitionId: 'd',
          role: 'Backend',
          status: 'working',
        },
      }).success
    ).toBe(false);
    expect(
      officeEventSchema.safeParse({
        type: 'sentinel.action.blocked',
        payload: { agentId: 'a', runId: 'r', actionType: 't', reason: 'x', policyId: 'p' },
      }).success
    ).toBe(false);
  });
  it('agentNodeSchema rejects non-numeric coordinates and unknown departments', () => {
    expect(
      agentNodeSchema.safeParse({
        id: 'a1',
        role: 'Backend',
        department: 'Backend',
        status: 'idle',
        position: { x: '0', y: 0, z: 0 },
      }).success
    ).toBe(false);
    expect(
      agentNodeSchema.safeParse({
        id: 'a1',
        role: 'Backend',
        department: 'Marketing',
        status: 'idle',
        position: { x: 0, y: 0, z: 0 },
      }).success
    ).toBe(false);
  });
});
