import { describe, expect, it } from 'vitest';
import {
  agentInitials,
  barWidthPct,
  contextBarColor,
  contextRatio,
  contextStatusColor,
  contextStatusText,
  defaultValueFormatter,
  formatCompactNumber,
  formatDelta,
  formatElapsed,
  formatMetricValue,
  getProTableCellText,
  getProTableRowKey,
  maxBarValue,
  tokenGradientClass,
  tokenUsagePercentage,
} from './format';
import {
  ninjaColors,
  ninjaRadius,
  ninjaShadows,
  ninjaTheme,
  ninjaTransitions,
  ninjaZIndex,
} from '../styles/theme';
import { ninjaTailwindColors, ninjaTailwindPreset } from '../styles/tailwind.config';

describe('formatCompactNumber', () => {
  it('formats millions with one decimal', () => {
    expect(formatCompactNumber(2500000)).toBe('2.5M');
  });
  it('formats thousands with one decimal', () => {
    expect(formatCompactNumber(1500)).toBe('1.5K');
  });
  it('returns plain string below 1000', () => {
    expect(formatCompactNumber(42)).toBe('42');
  });
});

describe('tokenUsagePercentage', () => {
  it('computes percentage', () => {
    expect(tokenUsagePercentage(50, 100)).toBe(50);
  });
  it('clamps above 100', () => {
    expect(tokenUsagePercentage(150, 100)).toBe(100);
  });
  it('returns 0 when max is not positive', () => {
    expect(tokenUsagePercentage(10, 0)).toBe(0);
    expect(tokenUsagePercentage(10, -5)).toBe(0);
  });
});

describe('tokenGradientClass', () => {
  it(' emerald below 60', () => {
    expect(tokenGradientClass(59.9)).toContain('emerald');
  });
  it('amber below 85', () => {
    expect(tokenGradientClass(84.9)).toContain('amber');
  });
  it('rose at/above 85', () => {
    expect(tokenGradientClass(85)).toContain('rose');
    expect(tokenGradientClass(100)).toContain('rose');
  });
});

describe('formatElapsed', () => {
  it('formats MM:SS under one hour', () => {
    expect(formatElapsed(65000)).toBe('01:05');
  });
  it('formats HH:MM:SS over one hour', () => {
    expect(formatElapsed(3723000)).toBe('01:02:03');
  });
  it('clamps negatives to zero', () => {
    expect(formatElapsed(-1000)).toBe('00:00');
  });
  it('zero is 00:00', () => {
    expect(formatElapsed(0)).toBe('00:00');
  });
});

describe('context helpers', () => {
  it('contextRatio clamps to [0,1]', () => {
    expect(contextRatio(25, 100)).toBe(0.25);
    expect(contextRatio(200, 100)).toBe(1);
    expect(contextRatio(10, 0)).toBe(0);
  });
  it('status text thresholds', () => {
    expect(contextStatusText(10)).toBe('Optimal');
    expect(contextStatusText(60)).toBe('Healthy');
    expect(contextStatusText(90)).toBe('Saturated');
    expect(contextStatusText(99)).toBe('Critical');
  });
  it('status color thresholds', () => {
    expect(contextStatusColor(10)).toBe('text-blue-400');
    expect(contextStatusColor(60)).toBe('text-purple-400');
    expect(contextStatusColor(90)).toBe('text-pink-400');
    expect(contextStatusColor(99)).toBe('text-rose-400');
  });
  it('bar color thresholds', () => {
    expect(contextBarColor(10)).toContain('blue-400');
    expect(contextBarColor(60)).toContain('indigo-400');
    expect(contextBarColor(90)).toContain('purple-400');
    expect(contextBarColor(99)).toContain('animate-pulse');
  });
});

describe('metric helpers', () => {
  it('formatMetricValue localizes numbers and passes strings', () => {
    expect(formatMetricValue(1234567)).toBe((1234567).toLocaleString());
    expect(formatMetricValue('42%')).toBe('42%');
  });
  it('formatDelta prefixes + for positives', () => {
    expect(formatDelta(12.34)).toBe('+12.3%');
    expect(formatDelta(-2)).toBe('-2.0%');
    expect(formatDelta(0)).toBe('0.0%');
  });
});

describe('bar list helpers', () => {
  it('barWidthPct is relative to max', () => {
    expect(barWidthPct(50, 100)).toBe(50);
    expect(barWidthPct(10, 0)).toBe(0);
  });
  it('maxBarValue ignores empty input', () => {
    expect(maxBarValue([1, 5, 3])).toBe(5);
    expect(maxBarValue([])).toBe(0);
  });
  it('defaultValueFormatter localizes', () => {
    expect(defaultValueFormatter(1000)).toBe((1000).toLocaleString());
  });
});

describe('pro table helpers', () => {
  const cols = [{ key: 'id' }, { key: 'name' }];
  it('getProTableRowKey prefers custom rowKey', () => {
    expect(getProTableRowKey(cols, { id: 'a' }, 0, () => 'custom')).toBe('custom');
  });
  it('getProTableRowKey falls back to first column value', () => {
    expect(getProTableRowKey(cols, { id: 'a' }, 0)).toBe('a');
  });
  it('getProTableRowKey falls back to index', () => {
    expect(getProTableRowKey(cols, {}, 7)).toBe(7);
    expect(getProTableRowKey([], { id: 'a' }, 2)).toBe(2);
  });
  it('getProTableCellText stringifies or blanks', () => {
    expect(getProTableCellText({ a: 1 }, 'a')).toBe('1');
    expect(getProTableCellText({}, 'missing')).toBe('');
  });
});

describe('agentInitials', () => {
  it('takes first letters up to 2', () => {
    expect(agentInitials('DB Architect')).toBe('DA');
    expect(agentInitials('Backend')).toBe('B');
  });
});

describe('theme tokens', () => {
  it('ninjaTheme consolidates all sections', () => {
    expect(ninjaTheme.colors).toBe(ninjaColors);
    expect(ninjaTheme.spacing['4']).toBe('16px');
    expect(ninjaTheme.zIndex.modal).toBe(1200);
    expect(ninjaTheme.transitions.fast).toContain('150ms');
  });
  it('radius / shadows / accent tokens exist', () => {
    expect(ninjaRadius.full).toBe('9999px');
    expect(ninjaShadows.glow).toContain('99, 102, 241');
    expect(ninjaColors.accent.primary).toBe('#6366f1');
    expect(ninjaColors.memory.frozen).toBe('#a855f7');
    expect(ninjaColors.agent.working).toBe('#22d3ee');
  });
  it('zIndex ordering is monotonic', () => {
    expect(ninjaZIndex.base).toBeLessThan(ninjaZIndex.dropdown);
    expect(ninjaZIndex.dropdown).toBeLessThan(ninjaZIndex.toast);
  });
});

describe('tailwind preset', () => {
  it('maps ninja tokens to tailwind colors', () => {
    expect(ninjaTailwindColors['ninja-bg'].primary).toBe(ninjaColors.background.primary);
    expect(ninjaTailwindColors['ninja-agent'].working).toBe(ninjaColors.agent.working);
    expect(ninjaTailwindColors['ninja-memory'].frozen).toBe(ninjaColors.memory.frozen);
  });
  it('preset extends radius, shadow and fonts', () => {
    const extend = ninjaTailwindPreset.theme.extend;
    expect(extend.borderRadius.ninja).toBe(ninjaRadius.md);
    expect(extend.boxShadow['ninja-glow']).toBe(ninjaShadows.glow);
    expect(extend.fontFamily.sans[0]).toContain('Inter');
  });
});
