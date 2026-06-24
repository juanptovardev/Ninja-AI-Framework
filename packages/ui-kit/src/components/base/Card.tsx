import React from 'react';

// ─── Types ───────────────────────────────────────────────────

export interface CardProps {
  /** Optional card title */
  title?: string;
  /** Optional subtitle under the title */
  subtitle?: string;
  /** Card content */
  children: React.ReactNode;
  /** Optional footer content */
  footer?: React.ReactNode;
  /** Show border */
  bordered?: boolean;
  /** Hover glow effect */
  hoverable?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Card padding size */
  padding?: 'sm' | 'md' | 'lg';
}

// ─── Component ───────────────────────────────────────────────

const paddingStyles: Record<string, string> = {
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  children,
  footer,
  bordered = true,
  hoverable = false,
  className = '',
  padding = 'md',
}) => {
  const classes = [
    'glass-card',
    !bordered ? 'border-transparent' : '',
    hoverable
      ? 'hover:border-[var(--ninja-accent)] hover:shadow-[0_0_15px_var(--ninja-accent-muted)] cursor-pointer'
      : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      {title ? (
        <div className={`${paddingStyles[padding]} border-b border-[#334155]`}>
          <h3 className="text-sm font-semibold text-[#f1f5f9]">{title}</h3>
          {subtitle ? (
            <p className="text-xs text-[#64748b] mt-0.5">{subtitle}</p>
          ) : null}
        </div>
      ) : null}

      <div className={paddingStyles[padding]}>{children}</div>

      {footer ? (
        <div
          className={`${paddingStyles[padding]} border-t border-[#334155] bg-[#111827] rounded-b-lg`}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
};

Card.displayName = 'Card';
