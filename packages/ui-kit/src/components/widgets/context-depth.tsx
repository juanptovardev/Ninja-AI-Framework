import React from 'react';
import {
  contextBarColor,
  contextRatio,
  contextStatusColor,
  contextStatusText,
} from '../../utils/format';

export interface ContextDepthProps {
  currentTokens: number;
  maxTokens: number;
  label?: string;
  className?: string;
}

export const ContextDepth: React.FC<ContextDepthProps> = ({
  currentTokens,
  maxTokens,
  label = 'Context Depth',
  className = '',
}) => {
  const ratio = contextRatio(currentTokens, maxTokens);
  const percentage = ratio * 100;

  // As context fills up, the color gets "hotter"
  const getColor = () => contextBarColor(percentage);

  const getStatusText = () => contextStatusText(percentage);

  const getStatusColor = () => contextStatusColor(percentage);

  return (
    <div className={`flex flex-col p-4 bg-white/[0.02] backdrop-blur-xl border border-white/[0.08] rounded-xl font-sans ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-zinc-400 tracking-tight">{label}</span>
        <span className={`text-xs font-semibold uppercase tracking-wider ${getStatusColor()}`}>
          {getStatusText()}
        </span>
      </div>

      {/* Multi-layered progress bar for a deeper "context" feel */}
      <div className="relative h-3 w-full rounded-full bg-black/40 overflow-hidden mb-3 shadow-inner">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSJ0cmFuc3BhcmVudCIvPgo8cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSI0IiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz4KPC9zdmc+')] opacity-20" />
        <div
          className={`absolute top-0 left-0 h-full rounded-full bg-gradient-to-r ${getColor()} transition-all duration-1000 ease-in-out shadow-[inset_0_1px_rgba(255,255,255,0.2)]`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="flex justify-between items-center text-xs text-zinc-500">
        <span className="font-mono">{Math.round(percentage)}%</span>
        <span>Depth Saturation</span>
      </div>
    </div>
  );
};
