/**
 * @ninja/ui-kit — Tailwind CSS Configuration
 * Extiende Tailwind con los tokens de diseño de Ninja.
 * Este archivo se importa en forge-console/tailwind.config.ts
 */

import { ninjaColors, ninjaRadius, ninjaShadows, ninjaTypography } from './theme';

/** Tailwind-compatible color map from Ninja theme */
export const ninjaTailwindColors = {
  'ninja-bg': {
    primary: ninjaColors.background.primary,
    secondary: ninjaColors.background.secondary,
    tertiary: ninjaColors.background.tertiary,
  },
  'ninja-surface': {
    DEFAULT: ninjaColors.surface.DEFAULT,
    hover: ninjaColors.surface.hover,
    active: ninjaColors.surface.active,
    elevated: ninjaColors.surface.elevated,
  },
  'ninja-border': {
    DEFAULT: ninjaColors.border.DEFAULT,
    subtle: ninjaColors.border.subtle,
    strong: ninjaColors.border.strong,
  },
  'ninja-fg': {
    primary: ninjaColors.foreground.primary,
    secondary: ninjaColors.foreground.secondary,
    muted: ninjaColors.foreground.muted,
    inverse: ninjaColors.foreground.inverse,
  },
  'ninja-accent': {
    DEFAULT: ninjaColors.accent.primary,
    hover: ninjaColors.accent.primaryHover,
    secondary: ninjaColors.accent.secondary,
    'secondary-hover': ninjaColors.accent.secondaryHover,
  },
  'ninja-success': {
    DEFAULT: ninjaColors.accent.success,
    muted: ninjaColors.accent.successMuted,
  },
  'ninja-warning': {
    DEFAULT: ninjaColors.accent.warning,
    muted: ninjaColors.accent.warningMuted,
  },
  'ninja-danger': {
    DEFAULT: ninjaColors.accent.danger,
    muted: ninjaColors.accent.dangerMuted,
  },
  'ninja-info': {
    DEFAULT: ninjaColors.accent.info,
    muted: ninjaColors.accent.infoMuted,
  },
  'ninja-agent': {
    idle: ninjaColors.agent.idle,
    working: ninjaColors.agent.working,
    failed: ninjaColors.agent.failed,
    completed: ninjaColors.agent.completed,
  },
  'ninja-memory': {
    hot: ninjaColors.memory.hot,
    warm: ninjaColors.memory.warm,
    cold: ninjaColors.memory.cold,
    frozen: ninjaColors.memory.frozen,
  },
} as const;

/** Tailwind preset for Ninja theme */
export const ninjaTailwindPreset = {
  theme: {
    extend: {
      colors: ninjaTailwindColors,
      borderRadius: {
        ninja: ninjaRadius.md,
        'ninja-sm': ninjaRadius.sm,
        'ninja-lg': ninjaRadius.lg,
        'ninja-xl': ninjaRadius.xl,
      },
      boxShadow: {
        'ninja-sm': ninjaShadows.sm,
        'ninja-md': ninjaShadows.md,
        'ninja-lg': ninjaShadows.lg,
        'ninja-glow': ninjaShadows.glow,
        'ninja-glow-cyan': ninjaShadows.glowCyan,
      },
      fontFamily: {
        sans: [ninjaTypography.fontFamily.sans],
        mono: [ninjaTypography.fontFamily.mono],
      },
    },
  },
} as const;
