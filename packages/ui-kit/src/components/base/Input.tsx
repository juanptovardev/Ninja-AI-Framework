import React, { forwardRef } from 'react';

// ─── Types ───────────────────────────────────────────────────

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Label text above the input */
  label?: string;
  /** Error message (shows in red below input) */
  error?: string;
  /** Helper text (shows in muted below input) */
  helperText?: string;
  /** Input size variant */
  inputSize?: 'sm' | 'md' | 'lg';
}

// ─── Style Maps ──────────────────────────────────────────────

const inputSizeStyles: Record<string, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-3 text-base',
};

// ─── Component ───────────────────────────────────────────────

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, inputSize = 'md', className = '', disabled, ...rest }, ref) => {
    const inputClasses = [
      'block w-full rounded-lg',
      'bg-[#111827] text-[#f1f5f9] placeholder-[#64748b]',
      'border transition-all duration-[250ms] ease-in-out',
      'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-[#0a0e17]',
      error
        ? 'border-[#ef4444] focus:ring-[#ef4444]'
        : 'border-[#334155] focus:border-[#6366f1] focus:ring-[#6366f1]',
      inputSizeStyles[inputSize],
      disabled ? 'opacity-50 cursor-not-allowed' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <label className="text-sm font-medium text-[#94a3b8]">{label}</label>
        ) : null}

        <input ref={ref} className={inputClasses} disabled={disabled} {...rest} />

        {error ? (
          <p className="text-xs text-[#ef4444]">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-[#64748b]">{helperText}</p>
        ) : null}
      </div>
    );
  },
);

Input.displayName = 'Input';
