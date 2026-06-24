'use client';

import { ContextPanel } from '@ninja/app-shell';
import { useGlobalState } from '../lib/context/GlobalStateContext';

export function ConnectedContextPanel() {
  const { tokenData, agentData, sessionStart, contextLayers, isLoading, error } = useGlobalState();

  if (isLoading) {
    return (
      <div className="w-80 bg-[#0f172a] border-l border-[#1e293b] p-4 flex items-center justify-center min-h-[200px]">
        <div className="text-xs text-[#64748b] flex items-center gap-2">
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Loading context...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-80 bg-[#0f172a] border-l border-[#1e293b] p-4">
        <div className="text-xs text-[#ef4444]">Error loading context data</div>
      </div>
    );
  }

  return (
    <ContextPanel
      tokenData={tokenData}
      agentData={agentData}
      sessionStart={sessionStart}
      contextLayers={contextLayers}
    />
  );
}
