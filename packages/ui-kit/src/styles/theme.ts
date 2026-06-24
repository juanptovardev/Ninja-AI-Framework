/**
 * @ninja/ui-kit — Design System Theme
 * Paleta oscuro premium para Ninja AI Framework
 *
 * Todos los colores usan formato HSL para mejor composición.
 * Los tokens siguen las convenciones del Plan Maestro sección 12.2.
 */

// ─── Color Palette ───────────────────────────────────────────

export const ninjaColors = {
  background: {
    primary: '#0a0e17',
    secondary: '#111827',
    tertiary: '#1a2233',
  },
  surface: {
    DEFAULT: '#1e293b',
    hover: '#253347',
    active: '#2d3d53',
    elevated: '#283548',
  },
  border: {
    DEFAULT: '#334155',
    subtle: '#1e293b',
    strong: '#475569',
  },
  foreground: {
    primary: '#f1f5f9',
    secondary: '#94a3b8',
    muted: '#64748b',
    inverse: '#0f172a',
  },
  accent: {
    primary: '#6366f1',       // Indigo — acción principal
    primaryHover: '#818cf8',
    secondary: '#22d3ee',     // Cyan — acentos secundarios
    secondaryHover: '#67e8f9',
    success: '#10b981',       // Emerald
    successMuted: '#064e3b',
    warning: '#f59e0b',       // Amber
    warningMuted: '#78350f',
    danger: '#ef4444',        // Red
    dangerMuted: '#7f1d1d',
    info: '#3b82f6',          // Blue
    infoMuted: '#1e3a5f',
  },
  agent: {
    idle: '#64748b',          // Slate — inactivo
    working: '#22d3ee',       // Cyan pulsante — trabajando
    failed: '#ef4444',        // Red — error
    completed: '#10b981',     // Green — completado
  },
  memory: {
    hot: '#f97316',           // Orange — memoria activa
    warm: '#eab308',          // Yellow — reciente
    cold: '#3b82f6',          // Blue — indexada
    frozen: '#a855f7',        // Purple — inmutable
  },
} as const;

// ─── Spacing ─────────────────────────────────────────────────

export const ninjaSpacing = {
  '0': '0px',
  '0.5': '2px',
  '1': '4px',
  '1.5': '6px',
  '2': '8px',
  '3': '12px',
  '4': '16px',
  '5': '20px',
  '6': '24px',
  '8': '32px',
  '10': '40px',
  '12': '48px',
  '16': '64px',
  '20': '80px',
  '24': '96px',
} as const;

// ─── Border Radius ───────────────────────────────────────────

export const ninjaRadius = {
  none: '0px',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '24px',
  full: '9999px',
} as const;

// ─── Shadows ─────────────────────────────────────────────────

export const ninjaShadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.3)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.4)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
  glow: '0 0 15px rgba(99, 102, 241, 0.3)',
  glowCyan: '0 0 15px rgba(34, 211, 238, 0.3)',
  inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.3)',
} as const;

// ─── Typography ──────────────────────────────────────────────

export const ninjaTypography = {
  fontFamily: {
    sans: "'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'",
    mono: "'JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'",
  },
  fontSize: {
    xs: ['0.75rem', { lineHeight: '1rem' }] as const,
    sm: ['0.875rem', { lineHeight: '1.25rem' }] as const,
    md: ['1rem', { lineHeight: '1.5rem' }] as const,
    lg: ['1.125rem', { lineHeight: '1.75rem' }] as const,
    xl: ['1.25rem', { lineHeight: '1.75rem' }] as const,
    '2xl': ['1.5rem', { lineHeight: '2rem' }] as const,
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }] as const,
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }] as const,
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
} as const;

// ─── Transitions ─────────────────────────────────────────────

export const ninjaTransitions = {
  fast: '150ms ease-in-out',
  normal: '250ms ease-in-out',
  slow: '350ms ease-in-out',
  spring: '500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

// ─── Z-Index Scale ───────────────────────────────────────────

export const ninjaZIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  modal: 1200,
  popover: 1300,
  tooltip: 1400,
  toast: 1500,
} as const;

// ─── Consolidated Theme Object ───────────────────────────────

export const ninjaTheme = {
  colors: ninjaColors,
  spacing: ninjaSpacing,
  radius: ninjaRadius,
  shadows: ninjaShadows,
  typography: ninjaTypography,
  transitions: ninjaTransitions,
  zIndex: ninjaZIndex,
} as const;

// ─── Type Exports ────────────────────────────────────────────

export type NinjaTheme = typeof ninjaTheme;
export type NinjaColors = typeof ninjaColors;
export type AgentStatusColor = keyof typeof ninjaColors.agent;
export type MemoryLayerColor = keyof typeof ninjaColors.memory;
export type AccentColor = keyof typeof ninjaColors.accent;
