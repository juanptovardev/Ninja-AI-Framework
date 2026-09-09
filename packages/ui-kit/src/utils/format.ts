/**
 * @ninja/ui-kit — Pure formatting / calculation helpers.
 *
 * Lógica pura extraída de los widgets (.tsx) para que sea testeable
 * sin render DOM. Los componentes importan desde aquí (fuente única).
 */

/** Compact number: 1500 -> "1.5K", 2_500_000 -> "2.5M" (token-meter). */
export function formatCompactNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

/** Token usage percentage clamped to [0, 100]. */
export function tokenUsagePercentage(current: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min((current / max) * 100, 100);
}

/** Gradient class for the token meter bar. */
export function tokenGradientClass(percentage: number): string {
  if (percentage < 60) return 'from-emerald-400 to-emerald-500';
  if (percentage < 85) return 'from-amber-400 to-amber-500';
  return 'from-rose-400 to-rose-500';
}

/** Elapsed ms -> "MM:SS" or "HH:MM:SS" (session-timer). */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/** Context fill ratio clamped to [0, 1]. */
export function contextRatio(currentTokens: number, maxTokens: number): number {
  if (maxTokens <= 0) return 0;
  return Math.min(currentTokens / maxTokens, 1);
}

export type ContextStatus = 'Optimal' | 'Healthy' | 'Saturated' | 'Critical';

export function contextStatusText(percentage: number): ContextStatus {
  if (percentage < 50) return 'Optimal';
  if (percentage < 80) return 'Healthy';
  if (percentage < 95) return 'Saturated';
  return 'Critical';
}

export function contextStatusColor(percentage: number): string {
  if (percentage < 50) return 'text-blue-400';
  if (percentage < 80) return 'text-purple-400';
  if (percentage < 95) return 'text-pink-400';
  return 'text-rose-400';
}

export function contextBarColor(percentage: number): string {
  if (percentage < 50) return 'from-blue-400 to-indigo-500';
  if (percentage < 80) return 'from-indigo-400 to-purple-500';
  if (percentage < 95) return 'from-purple-400 to-pink-500';
  return 'from-pink-500 to-rose-500 animate-pulse';
}

/** Metric value formatting (Metric pro component). */
export function formatMetricValue(value: string | number): string {
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  return value;
}

/** Delta badge text: 12.34 -> "+12.3%". */
export function formatDelta(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

/** Bar width percentage relative to max (BarList). */
export function barWidthPct(value: number, maxValue: number): number {
  if (maxValue <= 0) return 0;
  return (value / maxValue) * 100;
}

export function defaultValueFormatter(value: number): string {
  return value.toLocaleString();
}

export function maxBarValue(values: number[]): number {
  return Math.max(...values, 0);
}

/** Row key resolution (ProTable). */
export function getProTableRowKey<T extends Record<string, unknown>>(
  columns: Array<{ key: keyof T | string }>,
  item: T,
  index: number,
  rowKey?: (item: T, index: number) => string | number
): string | number {
  if (rowKey) return rowKey(item, index);
  const firstKey = columns[0]?.key;
  if (typeof firstKey === 'string') {
    const val = item[firstKey];
    if (val !== undefined) return String(val);
  }
  return index;
}

/** Cell fallback text (ProTable). */
export function getProTableCellText<T extends Record<string, unknown>>(
  item: T,
  key: keyof T | string
): string {
  if (typeof key !== 'string') return '';
  return String(item[key] ?? '');
}

/** Initials from a role label ("DB Architect" -> "DA"). */
export function agentInitials(role: string): string {
  return role
    .split(' ')
    .map((word) => word[0])
    .join('')
    .substring(0, 2);
}
