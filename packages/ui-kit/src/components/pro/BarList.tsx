import React from 'react';

// ─── Types ───────────────────────────────────────────────────

export type BarListColor = 'indigo' | 'cyan' | 'emerald' | 'amber' | 'red';

export interface BarListItem {
  name: string;
  value: number;
  href?: string;
}

export interface BarListProps {
  data: BarListItem[];
  valueFormatter?: (value: number) => string;
  color?: BarListColor;
  className?: string;
}

// ─── Color Maps ────────────────────────────────────────────────

const barColorMap: Record<BarListColor, string> = {
  indigo: 'bg-[var(--ninja-accent)]',
  cyan: 'bg-[var(--ninja-accent)]',
  emerald: 'bg-[var(--ninja-success)]',
  amber: 'bg-[var(--ninja-warning)]',
  red: 'bg-[var(--ninja-danger)]',
};

// ─── Helpers ─────────────────────────────────────────────────

const defaultValueFormatter = (value: number): string => {
  return value.toLocaleString();
};

// ─── Component ───────────────────────────────────────────────

export const BarList: React.FC<BarListProps> = ({
  data,
  valueFormatter = defaultValueFormatter,
  color = 'cyan',
  className = '',
}) => {
  const containerClasses = [
    'glass-card p-6',
    className,
  ].filter(Boolean).join(' ');

  if (data.length === 0) {
    return (
      <div className={containerClasses}>
        <div className="text-sm text-[var(--ninja-text-muted)] italic">No items available.</div>
      </div>
    );
  }

  const maxValue = Math.max(...data.map((item) => item.value), 0);

  return (
    <div className={containerClasses}>
      <div className="flex flex-col gap-4">
        {data.map((item, index) => {
          const barWidth = maxValue > 0 ? (item.value / maxValue) * 100 : 0;

          return (
            <div key={index} className="flex items-center group">
              {/* Name */}
              <div className="w-2/5 md:w-1/3 flex-shrink-0 pr-4">
                {item.href ? (
                  <a
                    href={item.href}
                    className="text-sm font-medium text-[var(--ninja-text-primary)] truncate block group-hover:text-[var(--ninja-accent)] transition-colors duration-200"
                    title={item.name}
                  >
                    {item.name}
                  </a>
                ) : (
                  <span className="text-sm font-medium text-[var(--ninja-text-primary)] truncate block" title={item.name}>
                    {item.name}
                  </span>
                )}
              </div>

              {/* Bar track */}
              <div className="flex-1 h-2.5 bg-[var(--ninja-bg-secondary)] rounded-r-md rounded-l-sm mx-4 overflow-hidden relative">
                <div
                  className={['h-full rounded-r-md rounded-l-sm absolute left-0 top-0 transition-all duration-700 ease-out', barColorMap[color]].join(' ')}
                  style={{ width: `${barWidth}%` }}
                />
              </div>

              {/* Value */}
              <div className="w-20 text-right flex-shrink-0">
                <span className="text-sm font-mono-data text-[var(--ninja-text-secondary)] group-hover:text-[var(--ninja-text-primary)] transition-colors duration-200">
                  {valueFormatter(item.value)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

BarList.displayName = 'BarList';
