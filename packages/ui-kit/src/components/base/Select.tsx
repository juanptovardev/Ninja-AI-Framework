import React from 'react';

// ─── Types ───────────────────────────────────────────────────

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  /** Label text above the select */
  label?: string;
  /** Options array */
  options: SelectOption[];
  /** Current value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Error message */
  error?: string;
  /** Placeholder (first disabled option) */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ─── Component ───────────────────────────────────────────────

export const Select: React.FC<SelectProps> = ({
  label,
  options,
  value,
  onChange,
  error,
  placeholder,
  disabled = false,
  className = '',
}) => {
  const selectClasses = [
    'block w-full rounded-lg px-3 py-2 text-sm',
    'bg-[#111827] text-[#f1f5f9]',
    'border transition-all duration-[250ms] ease-in-out',
    'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-[#0a0e17]',
    'appearance-none cursor-pointer',
    error
      ? 'border-[#ef4444] focus:ring-[#ef4444]'
      : 'border-[#334155] focus:border-[#6366f1] focus:ring-[#6366f1]',
    disabled ? 'opacity-50 cursor-not-allowed' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    onChange(e.target.value);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label className="text-sm font-medium text-[#94a3b8]">{label}</label>
      ) : null}

      <div className="relative">
        <select
          className={selectClasses}
          value={value}
          onChange={handleChange}
          disabled={disabled}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Dropdown chevron */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
          <svg
            className="h-4 w-4 text-[#64748b]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {error ? <p className="text-xs text-[#ef4444]">{error}</p> : null}
    </div>
  );
};

Select.displayName = 'Select';
