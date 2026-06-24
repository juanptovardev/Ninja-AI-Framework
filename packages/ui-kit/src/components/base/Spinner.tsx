import React from 'react';

// ─── Types ───────────────────────────────────────────────────

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps {
  /** Spinner size */
  size?: SpinnerSize;
  /** Additional CSS classes */
  className?: string;
  /** Accessible label */
  label?: string;
}

// ─── Style Maps ──────────────────────────────────────────────

const sizeStyles: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

// ─── Component ───────────────────────────────────────────────

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  className = '',
  label = 'Loading...',
}) => {
  const classes = [
    'animate-spin text-[#6366f1]',
    sizeStyles[size],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <svg
      className={classes}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      role="status"
      aria-label={label}
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
};

Spinner.displayName = 'Spinner';
