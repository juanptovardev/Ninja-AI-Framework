'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { getSystemStatus } from '../api-mock';
import type { SystemStatus, TaskStatus } from '../types';
import type { AgentInfo, AgentState } from '@ninja/ui-kit';

export interface GlobalState {
  systemStatus: SystemStatus | null;
  sessionStart: number;
  tokenData: {
    current: number;
    max: number;
  };
  contextLayers: { currentTokens: number; maxTokens: number };
  agentData: AgentInfo[];
  isLoading: boolean;
  error: Error | null;
}

interface GlobalStateContextValue extends GlobalState {
  refresh: () => Promise<void>;
}

const DEFAULT_TOKEN_DATA = {
  current: 18500,
  max: 32000,
};

const DEFAULT_MEMORY_LAYERS = {
  currentTokens: 12400,
  maxTokens: 32000,
};

const GlobalStateContext = createContext<GlobalStateContextValue | null>(null);

const taskStatusToAgentStatus = (status: TaskStatus): AgentState => {
  switch (status) {
    case 'running':
      return 'working';
    case 'pending':
      return 'idle';
    default:
      return 'blocked';
  }
};

const getAgentRole = (agentName: string): string => {
  const roles: Record<string, string> = {
    Backend: 'Backend Development',
    Tester: 'Quality Assurance',
    Designer: 'UI/UX Design',
    'Quality Gate': 'Code Review',
    'DB Architect': 'Database Design',
    Planner: 'Architecture Planning',
    Connector: 'API Integration',
    Security: 'Security Audit',
    Librarian: 'Knowledge Management',
    'Build Fixer': 'Error Recovery',
  };
  return roles[agentName] || 'Agent';
};

export const GlobalStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [sessionStart] = useState(Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      const status = await getSystemStatus();
      setSystemStatus(status);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch system status'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const agentData = useMemo<AgentInfo[]>(() => {
    if (!systemStatus?.recentTasks) {
      return [];
    }

    const agentMap = new Map<string, AgentInfo & { _timestamp: number }>();

    for (const task of systemStatus.recentTasks) {
      if (!task.agent) continue;

      const existing = agentMap.get(task.agent);
      if (!existing || task.timestamp > existing._timestamp) {
        agentMap.set(task.agent, {
          id: `agent-${task.agent.toLowerCase().replace(/\s+/g, '-')}`,
          name: task.agent,
          state: taskStatusToAgentStatus(task.status),
          task: task.status === 'running' ? task.name : undefined,
          _timestamp: task.timestamp,
        });
      }
    }

    return Array.from(agentMap.values())
      .slice(0, 5)
      .map(({ _timestamp, ...rest }) => rest);
  }, [systemStatus]);

  const value = useMemo<GlobalStateContextValue>(
    () => ({
      systemStatus,
      sessionStart,
      tokenData: DEFAULT_TOKEN_DATA,
      contextLayers: DEFAULT_MEMORY_LAYERS,
      agentData,
      isLoading,
      error,
      refresh: fetchStatus,
    }),
    [systemStatus, sessionStart, agentData, isLoading, error, fetchStatus]
  );

  return <GlobalStateContext.Provider value={value}>{children}</GlobalStateContext.Provider>;
};

export function useGlobalState(): GlobalStateContextValue {
  const context = useContext(GlobalStateContext);
  if (!context) {
    throw new Error('useGlobalState must be used within GlobalStateProvider');
  }
  return context;
}
