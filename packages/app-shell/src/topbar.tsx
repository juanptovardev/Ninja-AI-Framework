import React from 'react';
import { Badge, SessionTimer } from '@ninja/ui-kit';

// ─── Types ───────────────────────────────────────────────────

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

export interface TopbarProps {
  /** Current workspace name */
  workspaceName: string;
  /** Whether session is currently active */
  sessionActive: boolean;
  /** Connection status to backend */
  connectionStatus: ConnectionStatus;
  /** Session start time (Unix timestamp in ms) */
  sessionStartTime?: number;
}

// ─── Component ───────────────────────────────────────────────

export const Topbar: React.FC<TopbarProps> = ({
  workspaceName,
  sessionActive,
  connectionStatus,
  sessionStartTime,
}) => {
  // Status badge config
  const statusConfig: Record<ConnectionStatus, { label: string; variant: string }> = {
    connected: { label: 'Connected', variant: 'success' },
    disconnected: { label: 'Disconnected', variant: 'danger' },
    connecting: { label: 'Connecting', variant: 'info' },
  };

  const { label, variant } = statusConfig[connectionStatus];

  return (
    <div className="flex items-center justify-between h-16 px-4 bg-[#0f172a] border-b border-[#1e293b]">
      {/* Left side - Logo + Workspace */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-[#334155]">
          <span className="text-lg font-bold text-[#f1f5f9]">N</span>
        </div>
        <span className="text-sm font-medium text-[#f1f5f9]">{workspaceName}</span>
      </div>

      {/* Right side - Status + Session Timer */}
      <div className="flex items-center gap-4">
        <Badge variant={variant as any} pulse={connectionStatus === 'connecting'}>
          {label}
        </Badge>

        {sessionStartTime && sessionActive && (
          <SessionTimer startTime={sessionStartTime} label="Session" className="text-right" />
        )}
      </div>
    </div>
  );
};

Topbar.displayName = 'Topbar';
