import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface SessionTimerProps {
  startTime: number;
  className?: string;
  label?: string;
}

const formatElapsed = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
};

export const SessionTimer: React.FC<SessionTimerProps> = ({
  startTime,
  className = '',
  label = 'Session Active',
}) => {
  const [elapsed, setElapsed] = useState<number>(0);
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
    setElapsed(Date.now() - startTime);
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <div className={`flex flex-col p-4 bg-white/[0.02] backdrop-blur-xl border border-white/[0.08] rounded-xl font-sans ${className}`}>
      <span className="text-sm font-medium text-zinc-400 tracking-tight mb-2">{label}</span>
      <div className="flex items-center gap-3 bg-black/20 p-3 rounded-lg border border-white/[0.04]">
        <div className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
        </div>
        <span className="text-2xl font-mono font-light text-zinc-100 tabular-nums tracking-widest">
          {mounted ? formatElapsed(elapsed) : '--:--'}
        </span>
      </div>
    </div>
  );
};
