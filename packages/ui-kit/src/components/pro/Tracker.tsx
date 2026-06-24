import React from 'react';

// ─── Types ───────────────────────────────────────────────────

export type TrackerBlockColor = 'green' | 'yellow' | 'red' | 'slate';

export interface TrackerBlockData {
  /** Color representing the status */
  color: TrackerBlockColor;
  /** Optional tooltip text */
  tooltip?: string;
}

export interface TrackerProps {
  /** Array of blocks representing status over time */
  data: TrackerBlockData[];
  /** Optional label above the tracker */
  label?: string;
  /** Additional CSS classes */
  className?: string;
}

// ─── Color Maps ────────────────────────────────────────────────

const blockColorMap: Record<TrackerBlockColor, string> = {
  green: 'bg-[#10b981]',
  yellow: 'bg-[#f59e0b]',
  red: 'bg-[#ef4444]',
  slate: 'bg-[#334155]',
};

// ─── Component ───────────────────────────────────────────────

export const Tracker: React.FC<TrackerProps> = ({ data, label, className = '' }) => {
  const containerClasses = ['bg-[#1e293b] rounded-lg ring-1 ring-[#1e293b]', 'p-4', className]
    .filter(Boolean)
    .join(' ');

  if (data.length === 0) {
    return (
      <div className={containerClasses}>
        {label ? <div className="text-xs text-[#64748b] mb-2">{label}</div> : null}
        <div className="text-sm text-[#64748b] italic">No data</div>
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      {label ? <div className="text-xs text-[#64748b] mb-2">{label}</div> : null}
      <div className="flex gap-0.5 flex-wrap">
        {data.map((block, index) => (
          <div
            key={index}
            className={[
              'w-2 h-5 rounded-sm',
              'transition-opacity duration-150 hover:opacity-80',
              blockColorMap[block.color],
            ].join(' ')}
            title={block.tooltip}
          />
        ))}
      </div>
    </div>
  );
};

Tracker.displayName = 'Tracker';
