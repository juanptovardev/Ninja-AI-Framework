import React from 'react';

export interface TokenMeterProps {
  current: number;
  max: number;
  label?: string;
  className?: string;
}

export const TokenMeter: React.FC<TokenMeterProps> = ({
  current,
  max,
  label = 'Token Usage',
  className = '',
}) => {
  const percentage = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  
  const getGradient = () => {
    if (percentage < 60) return 'from-emerald-400 to-emerald-500';
    if (percentage < 85) return 'from-amber-400 to-amber-500';
    return 'from-rose-400 to-rose-500';
  };

  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div className={`flex flex-col p-4 bg-white/[0.02] backdrop-blur-xl border border-white/[0.08] rounded-xl font-sans ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-zinc-400 tracking-tight">{label}</span>
        <span className="text-sm font-medium text-zinc-300">{Math.round(percentage)}%</span>
      </div>

      <div className="relative h-2 w-full rounded-full bg-black/40 overflow-hidden mb-3">
        <div
          className={`absolute top-0 left-0 h-full rounded-full bg-gradient-to-r ${getGradient()} transition-all duration-700 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-semibold text-zinc-100 font-mono tracking-tight">
            {formatNumber(current)}
          </span>
          <span className="text-xs text-zinc-500">/ {formatNumber(max)}</span>
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">tokens</span>
      </div>
    </div>
  );
};
