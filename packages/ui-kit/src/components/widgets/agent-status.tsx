import React from 'react';

export type AgentState = 'idle' | 'working' | 'blocked';

export interface AgentInfo {
  id: string;
  name: string;
  state: AgentState;
  task?: string;
}

export interface AgentStatusProps {
  agents: AgentInfo[];
  className?: string;
}

const StateIcon: React.FC<{ state: AgentState }> = ({ state }) => {
  switch (state) {
    case 'working':
      return (
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
      );
    case 'blocked':
      return <span className="inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]" />;
    case 'idle':
    default:
      return <span className="inline-flex rounded-full h-2.5 w-2.5 bg-zinc-600" />;
  }
};

export const AgentStatus: React.FC<AgentStatusProps> = ({ agents, className = '' }) => {
  return (
    <div className={`flex flex-col p-4 bg-white/[0.02] backdrop-blur-xl border border-white/[0.08] rounded-xl font-sans ${className}`}>
      <h3 className="text-sm font-medium text-zinc-400 tracking-tight mb-4">Active Agents</h3>
      <div className="flex flex-col gap-3">
        {agents.map((agent) => (
          <div key={agent.id} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.01] hover:bg-white/[0.03] transition-colors border border-transparent hover:border-white/[0.05]">
            <div className="flex items-center gap-3">
              <StateIcon state={agent.state} />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-zinc-200">{agent.name}</span>
                {agent.task && (
                  <span className="text-xs text-zinc-500 truncate max-w-[150px]">{agent.task}</span>
                )}
              </div>
            </div>
            <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full ${
              agent.state === 'working' ? 'bg-emerald-500/10 text-emerald-400' :
              agent.state === 'blocked' ? 'bg-rose-500/10 text-rose-400' :
              'bg-zinc-500/10 text-zinc-400'
            }`}>
              {agent.state}
            </span>
          </div>
        ))}
        {agents.length === 0 && (
          <div className="text-sm text-zinc-500 text-center py-2">No agents active</div>
        )}
      </div>
    </div>
  );
};
