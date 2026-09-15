'use client';

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { ShellLayout, ContextPanel } from '@ninja/app-shell';
import { usePathname, useRouter } from 'next/navigation';
import { api, WS_URL } from '../lib/api';
import type { DashboardData } from '../lib/types';
import {
  tokenMeterFromMetrics,
  tokenDeltaFromEvent,
  sessionStartFromUptime,
  contextDepthFromTokenMeter,
  agentsFromTasks,
} from '@ninja/ui-kit';
import type { AgentInfo } from '@ninja/ui-kit';
import { Toaster } from 'sonner';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { DegradedModeBanner } from '../components/DegradedModeBanner';
import { EulaGate } from '../components/EulaGate';
import { LocaleSwitcher } from '../components/LocaleSwitcher';

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

const EMPTY_TOKEN_DATA = {
  current: 0,
  max: 0,
};

export function GlobalStateProvider({ children }: { children: React.ReactNode }) {
  const [systemStatus, setSystemStatus] = useState<DashboardData | null>(null);
  const [sessionStart, setSessionStart] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [tokenCurrent, setTokenCurrent] = useState(EMPTY_TOKEN_DATA.current);
  const [tokenMax, setTokenMax] = useState(EMPTY_TOKEN_DATA.max);

  const fetchStatus = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<DashboardData>('/api/dashboard');
      setSystemStatus(res.data);
      if (res.data) {
        const tokens = tokenMeterFromMetrics(res.data.pulse?.tokenMetrics, EMPTY_TOKEN_DATA);
        setTokenCurrent(tokens.current);
        setTokenMax(tokens.max);
        if (typeof res.data.uptime === 'number') {
          setSessionStart(sessionStartFromUptime(Date.now(), res.data.uptime));
        }
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
          const delta = tokenDeltaFromEvent(data);
          if (delta > 0) {
            setTokenCurrent((prev) => prev + delta);
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
                if (res.data) {
                  const tokens = tokenMeterFromMetrics(
                    res.data.pulse?.tokenMetrics,
                    EMPTY_TOKEN_DATA
                  );
                  setTokenCurrent(tokens.current);
                  setTokenMax(tokens.max);
                  if (typeof res.data.uptime === 'number') {
                    setSessionStart(sessionStartFromUptime(Date.now(), res.data.uptime));
                  }
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
    return agentsFromTasks(
      systemStatus.recentTasks.map((task) => ({
        id: task.id,
        name: task.name,
        status: task.status,
        agent: task.agent,
        timestamp: task.timestamp,
      }))
    );
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
      contextLayers={contextDepthFromTokenMeter({ current: tokenCurrent, max: tokenMax })}
    />
  );
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const isUccOrSetup = pathname === '/' || pathname === '/setup';

  if (isUccOrSetup) {
    return (
      <RadixTooltip.Provider>
        <GlobalStateProvider>
          <Toaster richColors position="top-right" />
          <DegradedModeBanner />
          <LocaleSwitcher />
          {children}
        </GlobalStateProvider>
      </RadixTooltip.Provider>
    );
  }

  const activePath = pathname === '/' ? '/mission-control' : pathname;

  return (
    <RadixTooltip.Provider>
      <GlobalStateProvider>
        <Toaster richColors position="top-right" />
        <DegradedModeBanner />
        <LocaleSwitcher />
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
    </RadixTooltip.Provider>
  );
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <EulaGate>
      <LayoutContent>{children}</LayoutContent>
    </EulaGate>
  );
}
