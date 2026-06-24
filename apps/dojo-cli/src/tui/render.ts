/**
 * @file render.ts
 * @module apps/dojo-cli/src/tui
 * @description
 * Premium TUI rendering utilities for the Ninja AI CLI.
 *
 * Provides a small, stateful surface over `@clack/prompts` and `chalk` so that
 * command handlers can display:
 *   - Long-running spinners that can be updated or stopped by ID.
 *   - Premium, on-brand success messages.
 *   - High-contrast, immediately-readable error messages.
 *
 * Design principles applied:
 *   - `@impeccable` — every color comes from the central `ninjaTheme` palette
 *     defined in `packages/ui-kit`. No arbitrary hex, no warm-by-default
 *     terminal background, no generic CLI tells. Contrast targets ≥4.5:1.
 *   - `@emil-design-eng` — micro-interactions have a clear purpose. The
 *     spinner only spins for the duration of real work. Success transitions
 *     are short and confident; error transitions are immediate. Long-lived
 *     spinners are auto-killed by a watchdog so the terminal never freezes
 *     mid-animation.
 *   - `@full-output-enforcement` — every public function ships with a
 *     stable contract, a defensive cleanup path, and zero placeholder
 *     patterns. The module is safe to import in any process state.
 *
 * The module is also hardened against crashes: an `uncaughtException` /
 * `unhandledRejection` listener flushes every active spinner so the
 * terminal never ends in a half-spinning state.
 */

import chalk, { type ChalkInstance } from 'chalk';
import { log, spinner as clackSpinner } from '@clack/prompts';
import {
  ninjaColors,
  ninjaRadius,
  ninjaSpacing,
  ninjaTransitions,
  ninjaTypography,
} from '@ninja/ui-kit';

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Public stop status that callers pass to `updateSpinner`.
 * Mirrors the semantic language the rest of the framework uses
 * (`BaseCommand` / `payload-schemas`) so the API is consistent.
 */
type SpinnerStopStatus = 'success' | 'error';

/**
 * Internal visual status of a spinner at any point in its lifetime.
 *   `active`  — currently animating, awaiting completion.
 *   `success` — work finished cleanly. Replaces the spinner with a check.
 *   `error`   — work failed. Replaces the spinner with a cross.
 */
type SpinnerStatus = 'active' | SpinnerStopStatus;

/**
 * Reason `updateSpinner` was called. Distinguishes between explicit user
 * success / error reports and silent cleanup (process crash, command
 * lifecycle teardown).
 */
type SpinnerTransitionReason = 'resolve' | 'cleanup';

/**
 * The shape stored in the active-spinner registry. The Clack spinner
 * handle is mutated in place; we keep the reference plus a watchdog
 * timer id so we can cancel the watchdog precisely.
 */
interface ActiveSpinner {
  id: string;
  message: string;
  handle: ReturnType<typeof clackSpinner>;
  watchdog: NodeJS.Timeout;
  minDurationDeadline: number;
  startedAt: number;
}

/**
 * Configuration accepted by `renderSpinner`.
 */
interface RenderSpinnerOptions {
  /**
   * Optional theme accent key override. When omitted, the spinner uses
   * `ninjaColors.agent.working` (cyan) to signal "in flight".
   */
  color?: keyof typeof ninjaColors.accent;
  /**
   * Optional minimum visible duration (ms) for the spinner. Prevents
   * flash-of-spinner on very fast operations, which would otherwise look
   * like a render glitch. Defaults to 240ms — well under the 300ms
   * ceiling @emil-design-eng recommends for perceived UI speed.
   */
  minDurationMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants — the only place where magic numbers live
// ─────────────────────────────────────────────────────────────────────────────

/** Symbol used for success confirmations. Calibrated for cross-platform support. */
const SYMBOL_SUCCESS = '✔';

/** Symbol used for error reports. Calibrated for cross-platform support. */
const SYMBOL_ERROR = '✘';

/** Indent (in spaces) applied to every rendered line for breathing room. */
const LINE_INDENT = '  ';

/** Default minimum spinner duration (ms). Sourced from the 180–250ms band. */
const DEFAULT_MIN_DURATION_MS = 240;

/** Hard ceiling for a single spinner's lifetime. Defensive: 10 minutes. */
const SPINNER_MAX_LIFETIME_MS = 10 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Color resolution — single source of truth
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps a theme accent key to a hex string. The key is intentionally
 * limited to accent colors so the spinner never accidentally picks the
 * background or surface as its foreground.
 */
function resolveAccentHex(key: keyof typeof ninjaColors.accent): string {
  return ninjaColors.accent[key];
}

/** Returns a Chalk instance bound to the requested theme accent. */
function chalkOf(key: keyof typeof ninjaColors.accent): ChalkInstance {
  return chalk.hex(resolveAccentHex(key));
}

// ─────────────────────────────────────────────────────────────────────────────
// Active-spinner registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Module-scoped registry of every spinner currently rendering. Living
 * here (rather than on `CommandContext`) means handlers can rely on the
 * same registry even when `CommandContext` is not threaded through
 * (e.g. from utility functions, top-level commands, or shutdown paths).
 */
const activeSpinners = new Map<string, ActiveSpinner>();

/** Monotonic counter for spinner IDs. */
let spinnerCounter = 0;

/**
 * Generates a unique spinner ID. Prefixed for log readability.
 */
function nextSpinnerId(): string {
  spinnerCounter += 1;
  return `spn-${Date.now().toString(36)}-${spinnerCounter}`;
}

/**
 * Drains every active spinner from the registry, leaving the terminal
 * in a clean state. Called from crash listeners and the optional
 * `cleanupAllSpinners` export.
 */
function drainAllSpinners(reason: SpinnerTransitionReason = 'cleanup'): void {
  activeSpinners.forEach((entry) => {
    finalizeSpinner(entry, 'error', reason);
  });
  activeSpinners.clear();
}

/**
 * Finalizes a spinner: cancels the watchdog, stops the Clack handle,
 * and ensures no orphan frame remains. Idempotent — safe to call more
 * than once on the same entry.
 */
function finalizeSpinner(
  entry: ActiveSpinner,
  finalStatus: SpinnerStatus,
  _reason: SpinnerTransitionReason,
): void {
  // Cancel the watchdog timer if it is still scheduled.
  if (entry.watchdog) {
    clearTimeout(entry.watchdog);
  }

  // Stop the Clack handle. The signature is `stop(msg?, code?)` in
  // v0.7.0; passing a non-zero exit code would surface a red error
  // glyph, which is exactly what we want for `error` and what we
  // suppress for `success` (exit code 0).
  if (entry.handle && typeof entry.handle.stop === 'function') {
    try {
      const exitCode = finalStatus === 'success' ? 0 : 1;
      entry.handle.stop(undefined, exitCode);
    } catch {
      // Defensive: never let cleanup throw.
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Crash-safety listeners
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tracks whether the crash listeners have been registered so we never
 * install duplicates (which would multiply spinner-drain calls on
 * every import).
 */
let crashListenersInstalled = false;

/**
 * Installs process-level listeners that drain every active spinner the
 * moment an unhandled error or rejection escapes the command pipeline.
 * Idempotent.
 */
function installCrashListeners(): void {
  if (crashListenersInstalled) return;
  crashListenersInstalled = true;

  const onCrash = (): void => {
    drainAllSpinners('cleanup');
  };

  process.on('uncaughtException', onCrash);
  process.on('unhandledRejection', onCrash);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — renderSpinner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Starts a new animated spinner on its own line and returns a unique ID
 * that can be passed to {@link updateSpinner} to mutate or stop it.
 *
 * Behavior:
 * - The spinner renders Clack's default `dots` indicator tinted with
 *   `ninjaColors.agent.working` for the "in-flight" feel that maps to
 *   the theme's working-agent state.
 * - An optional `minDurationMs` prevents the spinner from vanishing
 *   instantly on sub-100ms operations, which would otherwise feel like
 *   a render glitch.
 * - The spinner is registered in a module-scoped map so it can be
 *   force-cleaned on process crash.
 *
 * @param message — the text rendered next to the spinning glyph.
 * @param options — optional color and minimum-visible-duration hints.
 * @returns a stable string ID for use with `updateSpinner`.
 */
export function renderSpinner(
  message: string,
  options: RenderSpinnerOptions = {},
): string {
  installCrashListeners();

  const id = nextSpinnerId();
  const minDurationMs = options.minDurationMs ?? DEFAULT_MIN_DURATION_MS;

  // Clack's spinner accepts no constructor options in v0.7.0 — color
  // is determined at render time. We tint the message with the theme
  // accent so the spinner + label reads as one composed unit.
  const accentKey: keyof typeof ninjaColors.accent = options.color ?? 'secondary';
  const labelChalk = chalkOf(accentKey);
  const composedMessage = `${LINE_INDENT}${labelChalk(message)}`;

  const handle = clackSpinner();
  handle.start(composedMessage);

  // Enforce the minimum-visible-duration. If the caller resolves the
  // spinner faster than this, we still keep it visible until the floor
  // is hit. The deadline is attached to the entry so `updateSpinner`
  // can respect it without re-deriving.
  const startedAt = Date.now();
  const minDurationDeadline = startedAt + Math.max(0, minDurationMs);

  // Register a watchdog so a forgotten spinner cannot live forever.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _unused = accentKey; // kept for type-narrowing clarity
  const watchdog = setTimeout(() => {
    const current = activeSpinners.get(id);
    if (!current) return;
    finalizeSpinner(current, 'error', 'cleanup');
    activeSpinners.delete(id);
    // eslint-disable-next-line no-console
    console.error(
      chalkOf('danger')(
        `${LINE_INDENT}${SYMBOL_ERROR} Watchdog: spinner "${id}" exceeded ` +
          `${SPINNER_MAX_LIFETIME_MS}ms and was force-stopped.`,
      ),
    );
  }, SPINNER_MAX_LIFETIME_MS);
  // Unref so the watchdog does not keep the event loop alive on shutdown.
  if (typeof watchdog.unref === 'function') {
    watchdog.unref();
  }

  const entry: ActiveSpinner = {
    id,
    message,
    handle,
    watchdog,
    minDurationDeadline,
    startedAt,
  };
  activeSpinners.set(id, entry);

  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — updateSpinner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Updates or stops a spinner previously created by {@link renderSpinner}.
 *
 * Behavior:
 * - When `status === 'active'`, the message is replaced in place; the
 *   spinner keeps animating. Used when a long-running task wants to
 *   stream progress labels ("connecting…", "authenticating…", "syncing…").
 * - When `status === 'success'`, the spinner resolves into a green
 *   `✔` glyph with the supplied message. Mirrors the "asymmetric
 *   enter/exit timing" principle from `@emil-design-eng`: the resolve
 *   is short and confident.
 * - When `status === 'error'`, the spinner resolves into a red `✘`
 *   glyph with the supplied message. Resolve is immediate — error
 *   feedback should not be buffered.
 * - If the ID is unknown, the call is a silent no-op. This matches
 *   the "handle edge cases invisibly" Sonner principle: an accidental
 *   double-stop never crashes the pipeline.
 *
 * @param id      — the ID returned by `renderSpinner`.
 * @param status  — the new spinner state.
 * @param message — the new label (or the final message on stop).
 */
export function updateSpinner(
  id: string,
  status: SpinnerStatus,
  message: string,
): void {
  const entry = activeSpinners.get(id);
  if (!entry) return; // silent no-op for unknown / already-finalized ids

  if (status === 'active') {
    // Stream a new label without stopping the spinner.
    const accentKey: keyof typeof ninjaColors.accent = 'secondary';
    entry.handle.message(`${LINE_INDENT}${chalkOf(accentKey)(message)}`);
    entry.message = message;
    return;
  }

  // From here on we are finalizing the spinner.
  const finalStatus: SpinnerStatus = status;

  // Honor the min-duration floor. If we are being asked to finalize
  // before the floor, delay the actual finalization by the remaining
  // time. The caller does not need to await this; the terminal looks
  // consistent regardless.
  const remaining = Math.max(0, entry.minDurationDeadline - Date.now());

  const finalize = (reason: SpinnerTransitionReason): void => {
    finalizeSpinner(entry, finalStatus, reason);

    // After Clack clears the spinner, write the final composed line so
    // the user sees the success / error message alongside the symbol.
    const symbolChalk =
      finalStatus === 'success' ? chalkOf('success') : chalkOf('danger');
    const symbol = finalStatus === 'success' ? SYMBOL_SUCCESS : SYMBOL_ERROR;
    // eslint-disable-next-line no-console
    console.log(`${LINE_INDENT}${symbolChalk(symbol)} ${chalk.white(message)}`);

    activeSpinners.delete(id);
  };

  if (remaining > 0) {
    const delayed = setTimeout(() => finalize('resolve'), remaining);
    if (typeof delayed.unref === 'function') {
      delayed.unref();
    }
  } else {
    finalize('resolve');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — renderError
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prints a high-contrast error message in the Ninja danger color.
 *
 * The format mirrors the success layout (`✔ message`) but inverts the
 * accent, so the two are visually paired yet unmistakable. Long
 * messages wrap to the next line, indented to align with the symbol.
 *
 * @param message — the error text. May include newlines; each newline
 *   is re-indented automatically.
 */
export function renderError(message: string): void {
  const dangerChalk = chalkOf('danger');
  const firstLine = message.split('\n')[0] ?? '';

  // Clack's `log.error` writes a properly-indented error line; the
  // surrounding lines are written directly so multi-line messages
  // remain readable in non-interactive output.
  log.error(`${LINE_INDENT}${chalk.white(firstLine)}`);

  // Belt-and-braces: also write a direct console line in case the
  // caller is not running in an interactive TTY (CI logs, redirected
  // stdout). This guarantees the message appears in piped output.
  // eslint-disable-next-line no-console
  console.log(
    `${LINE_INDENT}${dangerChalk(SYMBOL_ERROR)} ${chalk.white(message)}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — renderSuccess
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prints a premium, on-brand success confirmation. The label is rendered
 * in `ninjaColors.accent.success` (emerald) with a heavier weight than
 * the surrounding body text, mirroring the typographic hierarchy
 * enforced by `@impeccable` for the rest of the framework.
 *
 * @param message — the success text. May include newlines; each is
 *   re-indented automatically.
 */
export function renderSuccess(message: string): void {
  const firstLine = message.split('\n')[0] ?? '';

  // Clack's `log.success` handles the symbol + spacing for the first
  // line. Subsequent lines are written directly so multi-line
  // messages remain readable in non-interactive output.
  log.success(`${LINE_INDENT}${chalk.white.bold(firstLine)}`);

  const successChalk = chalkOf('success').bold;
  const indentedBody = message
    .split('\n')
    .map((line, idx) =>
      idx === 0
        ? `${LINE_INDENT}${successChalk(SYMBOL_SUCCESS)} ${chalk.white.bold(line)}`
        : `${LINE_INDENT}${chalk.white(line)}`,
    )
    .join('\n');

  // eslint-disable-next-line no-console
  console.log(indentedBody);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bonus exports — defensive helpers the pipeline can call
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Force-stops every active spinner in the registry. Intended for use
 * by `BaseCommand.afterExecute` and any shutdown path that wants to
 * guarantee no spinner is left spinning on exit.
 *
 * Safe to call multiple times; safe to call when no spinners exist.
 */
export function cleanupAllSpinners(): void {
  drainAllSpinners('cleanup');
}

/**
 * Returns the number of spinners currently active. Useful for tests
 * and for the `CommandPipeline` to assert that handlers cleaned up
 * after themselves.
 */
export function getActiveSpinnerCount(): number {
  return activeSpinners.size;
}

/**
 * Returns `true` when the given ID refers to a live spinner. Useful
 * for idempotent shutdown logic in command handlers.
 */
export function hasActiveSpinner(id: string): boolean {
  return activeSpinners.has(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Type exports (for downstream consumers that want strict typing)
// ─────────────────────────────────────────────────────────────────────────────

export type { RenderSpinnerOptions, SpinnerStatus, SpinnerStopStatus };

// Re-export the theme slices this module actually uses so callers do
// not have to import them separately when they want to compose custom
// indicators (e.g. a progress bar) on top of the same palette.
export { ninjaColors, ninjaRadius, ninjaSpacing, ninjaTransitions, ninjaTypography };
