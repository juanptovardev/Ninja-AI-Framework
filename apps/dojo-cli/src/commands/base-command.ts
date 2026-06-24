/**
 * @file base-command.ts
 * @module apps/dojo-cli/src/commands
 * @description
 * Foundational interfaces and abstract class for the Ninja AI CLI command
 * system.  Every one of the 49 slash-command handlers must extend
 * `BaseCommand` and receive a validated `CommandContext` at execution time.
 *
 * Design decisions:
 * - `CommandContext` is the single source of truth for runtime state: it
 *   carries the full conversation history, the active workspace, the current
 *   language model, and an open-ended `sessionMetadata` bag for future
 *   extension (effort level, fast-mode flag, cost tracking, etc.).
 * - `BaseCommand` is abstract so TypeScript prevents direct instantiation.
 * - `execute` returns `Promise<void>` to keep the caller's control flow
 *   uniform; errors must be surfaced via thrown exceptions or the render
 *   utilities — never swallowed silently.
 * - `validate` has a default implementation that uses the Zod registry so
 *   concrete handlers can optionally call `super.validate()` without
 *   duplicating schema lookup logic.
 */

import type { ZodTypeAny, ZodError } from 'zod';
import type { BaseCommandPayload, CommandName } from '../schemas/payload-schemas.js';

// ─────────────────────────────────────────────────────────────────────────────
// History entry
// ─────────────────────────────────────────────────────────────────────────────

/** Role of the participant in a history entry. */
export type HistoryRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * A single entry in the conversation history buffer.
 * Mirrors the shape expected by most LLM provider APIs so it can be forwarded
 * directly to the runtime client without transformation.
 */
export interface HistoryEntry {
  /** Who produced this message. */
  role: HistoryRole;

  /** Text content of the message.  May be empty when `toolCalls` is set. */
  content: string;

  /**
   * Optional tool call records attached to this turn.
   * Present when `role === 'assistant'` and the model requested tool use.
   */
  toolCalls?: Array<{
    toolName: string;
    arguments: Record<string, unknown>;
    /** Response returned by the tool (populated after execution). */
    result?: unknown;
  }>;

  /** ISO-8601 timestamp when the message was added to history. */
  timestamp: string;

  /** Monotonically increasing index within the current session. */
  index: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session metadata
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open-ended map of session-level metadata carried by `CommandContext`.
 * Keys are defined by convention; new keys can be added without breaking
 * existing handlers.
 *
 * Well-known keys:
 * - `effortLevel` — 'low' | 'medium' | 'high' | 'max'
 * - `fastMode`    — boolean
 * - `costUsd`     — number (accumulated cost for the session)
 * - `totalInputTokens`  — number
 * - `totalOutputTokens` — number
 * - `startedAt`   — ISO-8601 string
 * - `sessionName` — human-readable label
 * - `sddChangeName` — active SDD change name (if any)
 * - `artifactStore` — 'engram' | 'openspec' | 'hybrid' | 'none'
 */
export type SessionMetadata = Record<string, unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// CommandContext
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runtime context threaded through every command handler.
 *
 * `CommandContext` is mutable by design — handlers like `/model`, `/effort`,
 * and `/clear` update it in place.  The pipeline is responsible for persisting
 * relevant fields (e.g., history) after each execution cycle.
 */
export interface CommandContext {
  /**
   * Full conversation history for the current session.
   * Handlers should append to this array; the pipeline trims it if it exceeds
   * the configured context window.
   */
  history: HistoryEntry[];

  /**
   * ID of the workspace currently active in this session.
   * Corresponds to a workspace record in the Ninja AI runtime.
   * May be `undefined` before the user has selected a workspace.
   */
  currentWorkspaceId: string | undefined;

  /**
   * Identifier of the language model currently in use.
   * The `/model` command handler mutates this field.
   *
   * Examples: "claude-opus-4", "gemini-3.5-flash", "deepseek-v4-flash"
   */
  model: string;

  /**
   * Open-ended metadata bag for session-level state that does not deserve a
   * first-class property (effort level, cost tracking, SDD context, etc.).
   */
  sessionMetadata: SessionMetadata;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation result
// ─────────────────────────────────────────────────────────────────────────────

/** Discriminated union returned by `BaseCommand.validate`. */
export type ValidationResult<T extends BaseCommandPayload = BaseCommandPayload> =
  | { success: true; data: T }
  | { success: false; error: ZodError };

// ─────────────────────────────────────────────────────────────────────────────
// BaseCommand
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Abstract base class for every slash-command handler.
 *
 * ### Contract
 * Concrete sub-classes MUST:
 * 1. Set `readonly name` to the exact command string (without leading slash).
 * 2. Set `readonly description` to a concise (< 120 char) human-readable string.
 * 3. Implement `execute(ctx, payload)` containing the handler logic.
 *
 * Concrete sub-classes MAY:
 * - Override `validate` if they need custom validation beyond the Zod schema.
 * - Override `getSchema` to return a Zod schema different from the registry
 *   default (useful for sub-command composition).
 *
 * ### Error handling
 * `execute` should throw a typed error on unrecoverable failure.  The
 * `CommandPipeline` catches all thrown errors and routes them to the
 * appropriate render utility.
 *
 * @template TPayload — the specific payload type for this command.
 */
export abstract class BaseCommand<
  TPayload extends BaseCommandPayload = BaseCommandPayload,
> {
  // ── Identity ──────────────────────────────────────────────────────────────

  /**
   * The command's identifier string (lowercase kebab-case, no leading slash).
   * Must exactly match a key in `COMMAND_SCHEMA_REGISTRY`.
   *
   * @example "code-review"
   */
  abstract readonly name: CommandName | string;

  /**
   * Short description shown in `/help` output.
   * Keep under 120 characters; use imperative mood.
   *
   * @example "Validate implementation against SDD specs and design."
   */
  abstract readonly description: string;

  /**
   * Optional longer description shown when the user runs `/help <command>`.
   * Supports basic markdown for rich terminal rendering.
   */
  readonly longDescription?: string;

  /**
   * Optional category tag used to group commands in the `/help` catalog.
   * Must be one of the predefined categories.
   */
  readonly category?:
    | 'session'
    | 'workspace'
    | 'planning'
    | 'config'
    | 'agents'
    | 'code'
    | 'metrics'
    | 'general';

  // ── Schema resolution ─────────────────────────────────────────────────────

  /**
   * Returns the Zod schema for this command.
   * Default implementation lazily imports the registry to avoid circular deps.
   * Override to provide a custom schema.
   */
  protected async getSchema(): Promise<ZodTypeAny | undefined> {
    const { COMMAND_SCHEMA_REGISTRY } = await import(
      '../schemas/payload-schemas.js'
    );
    return (COMMAND_SCHEMA_REGISTRY as Record<string, ZodTypeAny>)[this.name];
  }

  // ── Validation ────────────────────────────────────────────────────────────

  /**
   * Validates a raw payload object against this command's Zod schema.
   *
   * The `CommandPipeline` calls this before invoking `execute`, so handlers
   * can assume the payload is valid inside `execute` — unless they bypass the
   * pipeline (which they should not do).
   *
   * @param payload — raw (unvalidated) payload produced by the parser.
   * @returns A discriminated union: `{ success: true, data }` or
   *          `{ success: false, error }`.
   */
  async validate(payload: unknown): Promise<ValidationResult<TPayload>> {
    const schema = await this.getSchema();

    if (!schema) {
      // No schema registered — treat the payload as valid and cast.
      return { success: true, data: payload as TPayload };
    }

    const result = schema.safeParse(payload);

    if (result.success) {
      return { success: true, data: result.data as TPayload };
    }

    return { success: false, error: result.error };
  }

  // ── Lifecycle hooks ───────────────────────────────────────────────────────

  /**
   * Optional hook called by the pipeline BEFORE `execute`.
   * Use for pre-flight checks, permission verification, or telemetry.
   *
   * Return `false` to abort execution (the pipeline will not call `execute`).
   * The default implementation always returns `true`.
   *
   * @param ctx — current command context.
   * @param payload — validated payload.
   */
  async beforeExecute(
    _ctx: CommandContext,
    _payload: TPayload,
  ): Promise<boolean> {
    return true;
  }

  /**
   * Optional hook called by the pipeline AFTER `execute` (even on error if
   * `executeAlwaysRunAfter` is `true`).
   * Use for cleanup, metric recording, or history flushing.
   *
   * @param ctx — current command context (possibly mutated by `execute`).
   * @param payload — the validated payload that was passed to `execute`.
   * @param error — the error thrown by `execute`, or `undefined` on success.
   */
  async afterExecute(
    _ctx: CommandContext,
    _payload: TPayload,
    _error?: Error,
  ): Promise<void> {
    // Default: no-op.
  }

  /**
   * When `true`, `afterExecute` will be called even when `execute` throws.
   * Defaults to `false` — override to `true` in commands that need guaranteed
   * cleanup (e.g., `/loop`, `/batch`).
   */
  readonly executeAlwaysRunAfter: boolean = false;

  // ── Core execution ────────────────────────────────────────────────────────

  /**
   * Executes the command's business logic.
   *
   * This method receives a VALIDATED payload — the schema contract is already
   * enforced by the time this is called.  Implementations should:
   * - Mutate `ctx` as needed (history, model, sessionMetadata).
   * - Use `renderSuccess` / `renderError` from `tui/render.ts` for output.
   * - Throw a descriptive `Error` on unrecoverable failure.
   *
   * @param ctx — mutable runtime context for this session.
   * @param payload — validated, typed command payload.
   */
  abstract execute(ctx: CommandContext, payload: TPayload): Promise<void>;

  // ── Utility helpers ───────────────────────────────────────────────────────

  /**
   * Appends a user or assistant message to `ctx.history` with auto-generated
   * `timestamp` and `index`.
   *
   * @param ctx — context whose history to mutate.
   * @param role — role of the entry.
   * @param content — message text.
   * @returns The newly created `HistoryEntry`.
   */
  protected appendHistory(
    ctx: CommandContext,
    role: HistoryRole,
    content: string,
  ): HistoryEntry {
    const entry: HistoryEntry = {
      role,
      content,
      timestamp: new Date().toISOString(),
      index: ctx.history.length,
    };
    ctx.history.push(entry);
    return entry;
  }

  /**
   * Reads a well-known metadata key from the context, with a typed fallback.
   *
   * @param ctx — the current context.
   * @param key — metadata key to read.
   * @param fallback — value to return when the key is absent.
   */
  protected getMeta<T>(ctx: CommandContext, key: string, fallback: T): T {
    const value = ctx.sessionMetadata[key];
    return value !== undefined ? (value as T) : fallback;
  }

  /**
   * Sets a metadata key on the context.
   *
   * @param ctx — the current context (mutated in place).
   * @param key — metadata key.
   * @param value — value to store.
   */
  protected setMeta(ctx: CommandContext, key: string, value: unknown): void {
    ctx.sessionMetadata[key] = value;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a minimal anonymous `CommandContext` suitable for testing or
 * bootstrapping a new session.
 *
 * @param overrides — partial overrides applied on top of the defaults.
 */
export function createCommandContext(
  overrides: Partial<CommandContext> = {},
): CommandContext {
  return {
    history: [],
    currentWorkspaceId: undefined,
    model: 'claude-sonnet-4-6',
    sessionMetadata: {
      effortLevel: 'high',
      fastMode: false,
      costUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      startedAt: new Date().toISOString(),
    },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Command registry helper types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Constructor type for any class that extends `BaseCommand`.
 * Used by `CommandPipeline` to hold a type-safe registry of command classes.
 */
export type CommandConstructor = new () => BaseCommand;

/**
 * A map from command name strings to their handler constructors.
 * Used to power dynamic dispatch in `CommandPipeline`.
 */
export type CommandRegistry = Map<string, CommandConstructor>;
