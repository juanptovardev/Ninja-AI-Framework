import React from 'react';

// ─── Types ───────────────────────────────────────────────────

export interface DividerProps {
  /** Orientation of the divider */
  orientation?: 'horizontal' | 'vertical';
  /** Optional label in the middle of the divider */
  label?: string;
  /** Additional CSS classes */
  className?: string;
}

// ─── Component ───────────────────────────────────────────────

export const Divider: React.FC<DividerProps> = ({
  orientation = 'horizontal',
  label,
  className = '',
}) => {
  if (orientation === 'vertical') {
    return (
      <div
        className={`inline-block w-px self-stretch bg-[#334155] ${className}`}
        role="separator"
        aria-orientation="vertical"
      />
    );
  }

  if (label) {
    return (
      <div
        className={`flex items-center gap-3 ${className}`}
        role="separator"
        aria-orientation="horizontal"
      >
        <div className="flex-1 h-px bg-[#334155]" />
        <span className="text-xs text-[#64748b] font-medium">{label}</span>
        <div className="flex-1 h-px bg-[#334155]" />
      </div>
    );
  }

  return (
    <hr
      className={`border-none h-px bg-[#334155] ${className}`}
      role="separator"
      aria-orientation="horizontal"
    />
  );
};

Divider.displayName = 'Divider';
