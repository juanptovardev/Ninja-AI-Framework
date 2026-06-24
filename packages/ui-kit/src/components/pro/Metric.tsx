import React from 'react';
import { TrendUp, TrendDown, ArrowRight } from '@phosphor-icons/react';

// ─── Types ───────────────────────────────────────────────────

export type MetricColor = 'indigo' | 'cyan' | 'emerald' | 'amber' | 'red';

export interface MetricDelta {
  value: number;
  trend: 'up' | 'down' | 'flat';
}

export interface MetricProps {
  value: string | number;
  label: string;
  delta?: MetricDelta;
  prefix?: string;
  suffix?: string;
  color?: MetricColor;
  className?: string;
}

// ─── Color Maps ────────────────────────────────────────────────

// We use the new semantic variables for colors
const colorMap: Record<MetricColor, string> = {
  indigo: 'text-[var(--ninja-accent)]',
  cyan: 'text-[var(--ninja-accent)]', // Cyber cyan is our primary accent
  emerald: 'text-[var(--ninja-success)]',
  amber: 'text-[var(--ninja-warning)]',
  red: 'text-[var(--ninja-danger)]',
};

const deltaTrendColorMap: Record<string, string> = {
  up: 'text-[var(--ninja-success)]',
  down: 'text-[var(--ninja-danger)]',
  flat: 'text-[var(--ninja-text-muted)]',
};

const deltaBgMap: Record<string, string> = {
  up: 'bg-[var(--ninja-success)]/10',
  down: 'bg-[var(--ninja-danger)]/10',
  flat: 'bg-[var(--ninja-surface-hover)]',
};

// ─── Helpers ─────────────────────────────────────────────────

const getTrendIcon = (trend: 'up' | 'down' | 'flat') => {
  switch (trend) {
    case 'up':
      return <TrendUp weight="bold" className="w-3 h-3 ml-1" />;
    case 'down':
      return <TrendDown weight="bold" className="w-3 h-3 ml-1" />;
    case 'flat':
      return <ArrowRight weight="bold" className="w-3 h-3 ml-1" />;
    default:
      return null;
  }
};

const formatValue = (value: string | number): string => {
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  return value;
};

// ─── Component ───────────────────────────────────────────────

export const Metric: React.FC<MetricProps> = ({
  value,
  label,
  delta,
  prefix = '',
  suffix = '',
  color = 'cyan',
  className = '',
}) => {
  const containerClasses = [
    'glass-card interactive-card',
    'p-6 flex flex-col justify-center relative overflow-hidden',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const valueClasses = ['font-display text-5xl tracking-tighter text-[var(--ninja-text-primary)]'].join(' ');

  const formattedValue = formatValue(value);

  return (
    <div className={containerClasses}>
      {/* Decorative accent glow */}
      <div className={`absolute -top-10 -right-10 w-32 h-32 blur-3xl opacity-20 rounded-full bg-[var(--ninja-accent)]`} pointer-events-none="true" />
      
      <div className="text-sm font-semibold text-[var(--ninja-text-secondary)] mb-2 uppercase tracking-widest">{label}</div>
      <div className={valueClasses}>
        {prefix && <span className={`text-[var(--ninja-text-muted)] font-light mr-1`}>{prefix}</span>}
        {formattedValue}
        {suffix && <span className={`text-[var(--ninja-text-muted)] text-3xl font-light ml-1`}>{suffix}</span>}
      </div>

      {delta ? (
        <div className="mt-4 pt-4 border-t border-[var(--ninja-border-subtle)] flex items-center justify-between">
          <span
            className={[
              'inline-flex items-center px-2.5 py-1 rounded-sm text-xs font-bold tracking-wide',
              deltaBgMap[delta.trend],
              deltaTrendColorMap[delta.trend],
            ].join(' ')}
          >
            {delta.value > 0 ? '+' : ''}
            {delta.value.toFixed(1)}%
            {getTrendIcon(delta.trend)}
          </span>
        </div>
      ) : null}
    </div>
  );
};

Metric.displayName = 'Metric';
