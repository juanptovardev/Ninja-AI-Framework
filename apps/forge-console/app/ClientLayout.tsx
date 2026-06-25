'use client';

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { ShellLayout, ContextPanel } from '@ninja/app-shell';
import { usePathname, useRouter } from 'next/navigation';
import { api, WS_URL } from '../lib/api';
import type { DashboardData, TaskStatus } from '../lib/types';
import type { AgentInfo, AgentState } from '@ninja/ui-kit';
import { Toaster } from 'sonner';

interface GlobalState {
  sessionStart: number;
  tokenCurrent: number;
  tokenMax: number;
  agents: AgentInfo[];
  systemState: string;
  isLoading: boolean;
  error: Error | null;
}

interface GlobalStateContextValue extends GlobalState {
  refresh: () => Promise<void>;
}

const GlobalStateContext = createContext<GlobalStateContextValue | null>(null);

const DEFAULT_TOKEN_DATA = {
  current: 18500,
  max: 32000,
};

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

export function GlobalStateProvider({ children }: { children: React.ReactNode }) {
  const [systemStatus, setSystemStatus] = useState<DashboardData | null>(null);
  const [sessionStart] = useState(Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const [tokenCurrent, setTokenCurrent] = useState(DEFAULT_TOKEN_DATA.current);
  const [tokenMax, setTokenMax] = useState(DEFAULT_TOKEN_DATA.max);

  const fetchStatus = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<DashboardData>('/api/dashboard');
      setSystemStatus(res.data);
      if (res.data && res.data.pulse?.tokenMetrics) {
        setTokenCurrent(res.data.pulse.tokenMetrics.used);
        setTokenMax(res.data.pulse.tokenMetrics.budget);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch system status'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // Suscribirse al WebSocket para actualizar métricas en tiempo real
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connectWs = () => {
      ws = new WebSocket(WS_URL);
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Sumar tokens en tiempo real cuando un agente use LLM
          if (data.type === 'agent.llm.called' && data.payload?.data?.tokensUsed) {
            setTokenCurrent(prev => prev + (data.payload.data.tokensUsed as number));
          }
          
          // Si el estado del run/engine cambia, refrescar la data general
          if (
            data.type?.startsWith('engine.run.') || 
            data.type?.startsWith('agent.task.')
          ) {
            // Un delay corto para permitir que el backend persista los estados en DB
            setTimeout(() => {
              api.get<DashboardData>('/api/dashboard').then((res) => {
                setSystemStatus(res.data);
                if (res.data && res.data.pulse?.tokenMetrics) {
                  setTokenCurrent(res.data.pulse.tokenMetrics.used);
                  setTokenMax(res.data.pulse.tokenMetrics.budget);
                }
              }).catch(() => {});
            }, 100);
          }
        } catch {}
      };

      ws.onclose = () => {
        reconnectTimeout = setTimeout(connectWs, 3000);
      };
    };

    connectWs();
    return () => {
      if (ws) ws.close();
      clearTimeout(reconnectTimeout);
    };
  }, []);

  const agents = useMemo<AgentInfo[]>(() => {
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
      sessionStart,
      tokenCurrent,
      tokenMax,
      agents,
      systemState: systemStatus?.systemState || 'running',
      isLoading,
      error,
      refresh: fetchStatus,
    }),
    [sessionStart, tokenCurrent, tokenMax, agents, systemStatus?.systemState, isLoading, error, fetchStatus]
  );

  return <GlobalStateContext.Provider value={value}>{children}</GlobalStateContext.Provider>;
}

export function useGlobalState(): GlobalStateContextValue {
  const context = useContext(GlobalStateContext);
  if (!context) {
    throw new Error('useGlobalState must be used within GlobalStateProvider');
  }
  return context;
}

function ContextPanelWrapper() {
  const { sessionStart, tokenCurrent, tokenMax, agents } = useGlobalState();

  return (
    <ContextPanel
      sessionStart={sessionStart}
      tokenData={{ current: tokenCurrent, max: tokenMax }}
      agentData={agents}
      contextLayers={{
        currentTokens: tokenCurrent,
        maxTokens: tokenMax,
      }}
    />
  );
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const isUccOrSetup = pathname === '/' || pathname === '/setup';

  if (isUccOrSetup) {
    return <GlobalStateProvider><Toaster richColors position="top-right" />{children}</GlobalStateProvider>;
  }

  const activePath = pathname === '/' ? '/mission-control' : pathname;

  return (
    <GlobalStateProvider>
      <Toaster richColors position="top-right" />
      <ShellLayout
        sidebarProps={{
          activePath,
          onNavigate: (path: string) => {
            router.push(path);
          },
        }}
        rightRail={<ContextPanelWrapper />}
      >
        {children}
      </ShellLayout>
    </GlobalStateProvider>
  );
}
