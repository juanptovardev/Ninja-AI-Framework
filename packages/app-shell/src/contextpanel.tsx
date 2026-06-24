import React, { createContext, useContext, useState, useMemo } from 'react';
import { TokenMeter, AgentStatus, SessionTimer, ContextDepth, Divider } from '@ninja/ui-kit';
import type { AgentInfo, AgentState } from '@ninja/ui-kit';

interface ContextPanelState {
  sessionStart: number;
  tokenCurrent: number;
  tokenMax: number;
  agents: AgentInfo[];
  systemState: string;
}

const DEFAULT_TOKEN_DATA = {
  current: 18500,
  max: 32000,
};

const DEFAULT_MEMORY_LAYERS = {
  currentTokens: 12400,
  maxTokens: 32000,
};

const ContextPanelContext = createContext<ContextPanelState | null>(null);

interface ContextPanelProviderProps {
  children: React.ReactNode;
  state?: Partial<ContextPanelState>;
}

const ContextPanelProvider: React.FC<ContextPanelProviderProps> = ({ children, state }) => {
  const contextState = useMemo(
    () => ({
      sessionStart: state?.sessionStart ?? Date.now(),
      tokenCurrent: state?.tokenCurrent ?? DEFAULT_TOKEN_DATA.current,
      tokenMax: state?.tokenMax ?? DEFAULT_TOKEN_DATA.max,
      agents: state?.agents ?? [],
      systemState: state?.systemState ?? 'running',
    }),
    [state]
  );

  return (
    <ContextPanelContext.Provider value={contextState}>{children}</ContextPanelContext.Provider>
  );
};

const useContextPanelState = () => {
  const context = useContext(ContextPanelContext);
  if (!context) {
    return {
      sessionStart: Date.now(),
      tokenCurrent: DEFAULT_TOKEN_DATA.current,
      tokenMax: DEFAULT_TOKEN_DATA.max,
      agents: [],
      systemState: 'running',
    };
  }
  return context;
};

export interface ContextPanelProps {
  tokenData?: {
    current: number;
    max: number;
  };
  agentData?: AgentInfo[];
  sessionStart?: number;
  contextLayers?: { currentTokens: number; maxTokens: number };
}

export const ContextPanel: React.FC<ContextPanelProps> = (props) => {
  const contextState = useContextPanelState();

  const tokenData = props.tokenData || {
    current: contextState.tokenCurrent,
    max: contextState.tokenMax,
  };

  const agentData = props.agentData || contextState.agents;
  const sessionStart = props.sessionStart || contextState.sessionStart;

  const contextLayers = props.contextLayers || DEFAULT_MEMORY_LAYERS;

  const hasData = tokenData || agentData.length > 0 || sessionStart || contextLayers;

  if (!hasData) {
    return (
      <div className="w-full h-full p-4 flex items-center justify-center">
        <div className="text-xs text-[#64748b] italic">No context data available</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-transparent">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--ninja-glass-border)] bg-transparent">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[var(--ninja-accent)] rounded-full animate-pulse"></div>
          <h2 className="text-sm font-bold text-[#f1f5f9] tracking-wide">OBSERVABILITY</h2>
        </div>
        <p className="text-[11px] text-[#64748b] mt-1 font-medium">Real-time system metrics</p>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Session Timer */}
        <div className="bg-[var(--ninja-glass-bg)] border border-[var(--ninja-glass-border)] rounded-lg p-4 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide">
              Session Timer
            </h3>
            <div className="w-2 h-2 bg-[#10b981] rounded-full animate-pulse"></div>
          </div>
          <SessionTimer startTime={sessionStart} label="Duration" />
        </div>

        {/* Token Meter */}
        {tokenData && (
          <>
            <Divider />
            <div className="bg-[var(--ninja-glass-bg)] border border-[var(--ninja-glass-border)] rounded-lg p-4 shadow-sm backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide">
                  Token Budget
                </h3>
                <span className="text-[10px] text-[#64748b]">
                  {Math.round((tokenData.current / tokenData.max) * 100)}%
                </span>
              </div>
              <TokenMeter current={tokenData.current} max={tokenData.max} label="Usage" />
            </div>
          </>
        )}

        {/* Agent Status */}
        {agentData && agentData.length > 0 && (
          <>
            <Divider />
            <div className="bg-[var(--ninja-glass-bg)] border border-[var(--ninja-glass-border)] rounded-lg p-4 shadow-sm backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide">
                  Active Agents
                </h3>
                <span className="text-[10px] text-[#64748b]">{agentData.length} online</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                <AgentStatus agents={agentData.slice(0, 5)} />
              </div>
            </div>
          </>
        )}

        {/* Context Depth */}
        {contextLayers && (
          <>
            <Divider />
            <div className="bg-[var(--ninja-glass-bg)] border border-[var(--ninja-glass-border)] rounded-lg p-4 shadow-sm backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide">
                  Memory Layers
                </h3>
                <span className="text-[10px] text-[#64748b]">
                  {Math.round((contextLayers.currentTokens / contextLayers.maxTokens) * 100)}% Saturation
                </span>
              </div>
              <ContextDepth currentTokens={contextLayers.currentTokens} maxTokens={contextLayers.maxTokens} label="Depth" />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

ContextPanel.displayName = 'ContextPanel';
