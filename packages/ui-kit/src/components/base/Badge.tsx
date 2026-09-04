import React from 'react';

// ─── Types ───────────────────────────────────────────────────

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

export interface BadgeProps {
  /** Badge visual variant */
  variant?: BadgeVariant;
  /** Badge content */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Show pulsating dot indicator */
  pulse?: boolean;
  /** Announce content changes politely to screen readers (a11y §8.3) */
  'aria-live'?: 'polite' | 'assertive' | 'off';
}

// ─── Style Maps ──────────────────────────────────────────────

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-[#334155] text-[#94a3b8]',
  success: 'bg-[#064e3b] text-[#10b981]',
  warning: 'bg-[#78350f] text-[#f59e0b]',
  danger: 'bg-[#7f1d1d] text-[#ef4444]',
  info: 'bg-[#1e3a5f] text-[#3b82f6]',
  accent: 'bg-[#312e81] text-[#818cf8]',
};

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-[#94a3b8]',
  success: 'bg-[#10b981]',
  warning: 'bg-[#f59e0b]',
  danger: 'bg-[#ef4444]',
  info: 'bg-[#3b82f6]',
  accent: 'bg-[#818cf8]',
};

// ─── Component ───────────────────────────────────────────────

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  children,
  className = '',
  pulse = false,
  'aria-live': ariaLive,
}) => {
  const classes = [
    'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium',
    'transition-colors duration-[150ms]',
    variantStyles[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} aria-live={ariaLive}>
      {pulse ? (
        <span className="relative flex h-2 w-2">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColors[variant]}`}
          />
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${dotColors[variant]}`}
          />
        </span>
      ) : null}
      {children}
    </span>
  );
};

Badge.displayName = 'Badge';
