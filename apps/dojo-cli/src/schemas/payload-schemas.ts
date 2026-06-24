/**
 * @file payload-schemas.ts
 * @module apps/dojo-cli/src/schemas
 * @description
 * Zod validation schemas for every slash-command payload in the Ninja AI CLI.
 * Each schema extends `BaseCommandPayloadSchema` adding command-specific
 * args/flags constraints.  Import individual schemas in handlers for strict
 * runtime validation.
 *
 * Commands (49 total):
 *   grillme, goal, planning, explore, verify, architect, diagnose, onboard,
 *   refactor, snapshot, clear, reset, new, resume, rename, branch, fork,
 *   rewind, exit, quit, compact, context, memory, export, copy, config,
 *   settings, model, effort, fast, permissions, init, plan, batch, btw,
 *   tasks, mcp, skills, agents, diff, review, code-review, debug, loop,
 *   claude-api, cost, stats, usage, help.
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Primitive building blocks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scalar union type accepted by any flag value.
 * Supports --flag=string | --flag=42 | --flag (boolean true).
 */
const FlagValue = z.union([z.string(), z.boolean(), z.number()]);

/**
 * Generic open-ended flags record for schemas that need no typed flags.
 * z.object({}).catchall() gives us a plain object with string keys → FlagValue,
 * which IS an object (has .extend(), etc.) unlike z.record().
 */
const GenericFlagsSchema = z
  .object({})
  .catchall(FlagValue);

// ─────────────────────────────────────────────────────────────────────────────
// BaseCommandPayloadSchema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base shape shared by every slash-command payload.
 * All command-specific schemas extend this via `.extend()`.
 */
export const BaseCommandPayloadSchema = z.object({
  /** The raw string as typed by the user, e.g. "/model gemini-3.5-flash --fast". */
  rawInput: z.string(),

  /** The parsed command name without the leading slash, e.g. "model". */
  commandName: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Command name must be lowercase kebab-case'),

  /**
   * Positional arguments that follow the command name.
   * e.g. `/model gemini-3.5-flash` → args: ["gemini-3.5-flash"]
   */
  args: z.array(z.string()).default([]),

  /**
   * Parsed flags in key/value form.
   * Supports `--key=value`, `--key value`, `--flag` (boolean true), `-f` (boolean true).
   */
  flags: GenericFlagsSchema.default({}),
});

export type BaseCommandPayload = z.infer<typeof BaseCommandPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Helper: typed flags builder
// Creates an object schema with specific optional typed keys + an open catchall.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a flags schema that has specific typed optional keys but also allows
 * any additional arbitrary string flags (open-ended via catchall).
 * This replaces the broken `FlagsSchema.extend({})` pattern (z.record has no .extend).
 */
function typedFlags<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).catchall(FlagValue).default({} as z.infer<z.ZodObject<T>>);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: create a schema that overrides commandName to a literal
// ─────────────────────────────────────────────────────────────────────────────

function makeSchema<T extends z.ZodRawShape>(
  commandLiteral: string,
  extra: T,
) {
  return BaseCommandPayloadSchema.extend({
    commandName: z.literal(commandLiteral),
    ...extra,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. /grillme — Adversarial interview mode
// ─────────────────────────────────────────────────────────────────────────────

export const GrillmePayloadSchema = makeSchema('grillme', {
  /** Optional topic the user wants to be grilled on. */
  args: z.array(z.string()).max(10).default([]),
  flags: typedFlags({
    /** Number of interview rounds. */
    rounds: z.coerce.number().int().positive().optional(),
    /** Target difficulty level. */
    difficulty: z.enum(['easy', 'medium', 'hard', 'brutal']).optional(),
  }),
});

export type GrillmePayload = z.infer<typeof GrillmePayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 2. /goal — Set a long-running autonomous goal
// ─────────────────────────────────────────────────────────────────────────────

export const GoalPayloadSchema = makeSchema('goal', {
  /** Goal description tokens (joined to form the goal string). */
  args: z.array(z.string()).min(1, 'Goal description is required').default([]),
  flags: typedFlags({
    /** Maximum agent iterations before stopping. */
    'max-iterations': z.coerce.number().int().positive().optional(),
    /** Persist goal across sessions. */
    persist: z.boolean().optional(),
  }),
});

export type GoalPayload = z.infer<typeof GoalPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 3. /planning — Kick off SDD planning phase
// ─────────────────────────────────────────────────────────────────────────────

export const PlanningPayloadSchema = makeSchema('planning', {
  /** Optional change name or topic. */
  args: z.array(z.string()).max(5).default([]),
  flags: typedFlags({
    /** Artifact store to use for planning artifacts. */
    store: z.enum(['engram', 'openspec', 'hybrid', 'none']).optional(),
    /** Interactive or automatic mode. */
    mode: z.enum(['interactive', 'auto']).optional(),
  }),
});

export type PlanningPayload = z.infer<typeof PlanningPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 4. /explore — Explore/investigate a topic or change
// ─────────────────────────────────────────────────────────────────────────────

export const ExplorePayloadSchema = makeSchema('explore', {
  /** Topic or change name to explore. */
  args: z.array(z.string()).min(1, 'Topic is required').default([]),
  flags: typedFlags({
    /** Scope the exploration to a specific directory. */
    scope: z.string().optional(),
    /** Enable deep codebase analysis. */
    deep: z.boolean().optional(),
  }),
});

export type ExplorePayload = z.infer<typeof ExplorePayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 5. /verify — Validate implementation against specs
// ─────────────────────────────────────────────────────────────────────────────

export const VerifyPayloadSchema = makeSchema('verify', {
  /** Optional change name to verify. */
  args: z.array(z.string()).max(3).default([]),
  flags: typedFlags({
    /** Only show critical findings. */
    'critical-only': z.boolean().optional(),
    /** Fix auto-fixable issues in place. */
    fix: z.boolean().optional(),
  }),
});

export type VerifyPayload = z.infer<typeof VerifyPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 6. /architect — Run the architecture design phase
// ─────────────────────────────────────────────────────────────────────────────

export const ArchitectPayloadSchema = makeSchema('architect', {
  /** Feature or change to architect. */
  args: z.array(z.string()).min(1, 'Feature description is required').default([]),
  flags: typedFlags({
    /** Target layer (backend, frontend, infra, full). */
    layer: z.enum(['backend', 'frontend', 'infra', 'full']).optional(),
    /** Produce diagrams alongside design. */
    diagram: z.boolean().optional(),
  }),
});

export type ArchitectPayload = z.infer<typeof ArchitectPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 7. /diagnose — Diagnose system or agent configuration issues
// ─────────────────────────────────────────────────────────────────────────────

export const DiagnosePayloadSchema = makeSchema('diagnose', {
  /** Optional agent or subsystem target. */
  args: z.array(z.string()).max(3).default([]),
  flags: typedFlags({
    /** Output full diagnostic report. */
    verbose: z.boolean().optional(),
    /** Agent to diagnose. */
    agent: z.string().optional(),
  }),
});

export type DiagnosePayload = z.infer<typeof DiagnosePayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 8. /onboard — Onboard through SDD walkthrough
// ─────────────────────────────────────────────────────────────────────────────

export const OnboardPayloadSchema = makeSchema('onboard', {
  args: z.array(z.string()).max(2).default([]),
  flags: typedFlags({
    /** Skip intro and go directly to step N. */
    step: z.coerce.number().int().min(1).optional(),
  }),
});

export type OnboardPayload = z.infer<typeof OnboardPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 9. /refactor — Refactor code with guided analysis
// ─────────────────────────────────────────────────────────────────────────────

export const RefactorPayloadSchema = makeSchema('refactor', {
  /** File path(s) or description of what to refactor. */
  args: z.array(z.string()).min(1, 'Target is required').default([]),
  flags: typedFlags({
    /** Refactor strategy. */
    strategy: z.enum(['extract', 'inline', 'rename', 'split', 'merge']).optional(),
    /** Dry run — show diff without applying. */
    'dry-run': z.boolean().optional(),
  }),
});

export type RefactorPayload = z.infer<typeof RefactorPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 10. /snapshot — Take a codebase snapshot for recovery
// ─────────────────────────────────────────────────────────────────────────────

export const SnapshotPayloadSchema = makeSchema('snapshot', {
  /** Optional label for the snapshot. */
  args: z.array(z.string()).max(5).default([]),
  flags: typedFlags({
    /** Include node_modules in snapshot (default false). */
    'include-deps': z.boolean().optional(),
    /** Output format. */
    format: z.enum(['tar', 'zip', 'git-stash']).optional(),
  }),
});

export type SnapshotPayload = z.infer<typeof SnapshotPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 11. /clear — Clear conversation history or context
// ─────────────────────────────────────────────────────────────────────────────

export const ClearPayloadSchema = makeSchema('clear', {
  /** What to clear: 'history' | 'context' | 'all'. Default 'history'. */
  args: z.array(z.enum(['history', 'context', 'all'])).max(1).default([]),
  flags: typedFlags({
    /** Skip confirmation prompt. */
    force: z.boolean().optional(),
  }),
});

export type ClearPayload = z.infer<typeof ClearPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 12. /reset — Reset session to initial state
// ─────────────────────────────────────────────────────────────────────────────

export const ResetPayloadSchema = makeSchema('reset', {
  args: z.array(z.string()).max(1).default([]),
  flags: typedFlags({
    /** Hard reset (clear all persistent state). */
    hard: z.boolean().optional(),
    /** Keep model selection after reset. */
    'keep-model': z.boolean().optional(),
  }),
});

export type ResetPayload = z.infer<typeof ResetPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 13. /new — Start a new session or project
// ─────────────────────────────────────────────────────────────────────────────

export const NewPayloadSchema = makeSchema('new', {
  /** Project or session name. */
  args: z.array(z.string()).max(5).default([]),
  flags: typedFlags({
    /** Template to bootstrap from. */
    template: z.string().optional(),
    /** Workspace directory. */
    workspace: z.string().optional(),
  }),
});

export type NewPayload = z.infer<typeof NewPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 14. /resume — Resume a previous session or task
// ─────────────────────────────────────────────────────────────────────────────

export const ResumePayloadSchema = makeSchema('resume', {
  /** Session ID or name to resume. */
  args: z.array(z.string()).max(1).default([]),
  flags: typedFlags({
    /** Resume the most recent session without prompting. */
    last: z.boolean().optional(),
  }),
});

export type ResumePayload = z.infer<typeof ResumePayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 15. /rename — Rename the current session
// ─────────────────────────────────────────────────────────────────────────────

export const RenamePayloadSchema = makeSchema('rename', {
  /** New session name. */
  args: z.array(z.string()).min(1, 'New name is required').max(3).default([]),
  flags: GenericFlagsSchema.default({}),
});

export type RenamePayload = z.infer<typeof RenamePayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 16. /branch — Create a conversation branch
// ─────────────────────────────────────────────────────────────────────────────

export const BranchPayloadSchema = makeSchema('branch', {
  /** Branch name or label. */
  args: z.array(z.string()).max(3).default([]),
  flags: typedFlags({
    /** Fork from a specific message index. */
    'from-index': z.coerce.number().int().min(0).optional(),
  }),
});

export type BranchPayload = z.infer<typeof BranchPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 17. /fork — Fork the current session into a new independent session
// ─────────────────────────────────────────────────────────────────────────────

export const ForkPayloadSchema = makeSchema('fork', {
  /** Optional label for the forked session. */
  args: z.array(z.string()).max(3).default([]),
  flags: typedFlags({
    /** Carry the full context into the fork (default true). */
    'carry-context': z.boolean().optional(),
  }),
});

export type ForkPayload = z.infer<typeof ForkPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 18. /rewind — Rewind history to a prior state
// ─────────────────────────────────────────────────────────────────────────────

export const RewindPayloadSchema = makeSchema('rewind', {
  /** Number of turns to rewind, or a message index. */
  args: z.array(z.string()).max(1).default([]),
  flags: typedFlags({
    /** Rewind N turns back. */
    turns: z.coerce.number().int().positive().optional(),
    /** Rewind to a specific message index. */
    'to-index': z.coerce.number().int().min(0).optional(),
  }),
});

export type RewindPayload = z.infer<typeof RewindPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 19. /exit — Exit the CLI session gracefully
// ─────────────────────────────────────────────────────────────────────────────

export const ExitPayloadSchema = makeSchema('exit', {
  args: z.array(z.string()).max(0).default([]),
  flags: typedFlags({
    /** Exit without saving session. */
    'no-save': z.boolean().optional(),
  }),
});

export type ExitPayload = z.infer<typeof ExitPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 20. /quit — Alias for exit
// ─────────────────────────────────────────────────────────────────────────────

export const QuitPayloadSchema = makeSchema('quit', {
  args: z.array(z.string()).max(0).default([]),
  flags: typedFlags({
    /** Exit without saving session. */
    'no-save': z.boolean().optional(),
  }),
});

export type QuitPayload = z.infer<typeof QuitPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 21. /compact — Compact/summarize conversation context
// ─────────────────────────────────────────────────────────────────────────────

export const CompactPayloadSchema = makeSchema('compact', {
  /** Optional summary instruction. */
  args: z.array(z.string()).max(10).default([]),
  flags: typedFlags({
    /** Target token budget after compaction. */
    budget: z.coerce.number().int().positive().optional(),
  }),
});

export type CompactPayload = z.infer<typeof CompactPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 22. /context — Show or manipulate the current context window
// ─────────────────────────────────────────────────────────────────────────────

export const ContextPayloadSchema = makeSchema('context', {
  /** Subcommand: show | add | remove | list. */
  args: z.array(z.enum(['show', 'add', 'remove', 'list'])).max(1).default([]),
  flags: typedFlags({
    /** File or content to add/remove. */
    file: z.string().optional(),
  }),
});

export type ContextPayload = z.infer<typeof ContextPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 23. /memory — Manage Engram persistent memory
// ─────────────────────────────────────────────────────────────────────────────

export const MemoryPayloadSchema = makeSchema('memory', {
  /** Subcommand: search | show | save | delete | list. */
  args: z.array(z.enum(['search', 'show', 'save', 'delete', 'list'])).max(1).default([]),
  flags: typedFlags({
    /** Query string for search. */
    query: z.string().optional(),
    /** Memory observation ID. */
    id: z.string().optional(),
  }),
});

export type MemoryPayload = z.infer<typeof MemoryPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 24. /export — Export session artifacts or history to disk
// ─────────────────────────────────────────────────────────────────────────────

export const ExportPayloadSchema = makeSchema('export', {
  /** What to export: session | artifacts | history | all. */
  args: z.array(z.enum(['session', 'artifacts', 'history', 'all'])).max(1).default([]),
  flags: typedFlags({
    /** Output directory path. */
    output: z.string().optional(),
    /** Export format. */
    format: z.enum(['json', 'markdown', 'csv']).optional(),
  }),
});

export type ExportPayload = z.infer<typeof ExportPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 25. /copy — Copy last response or artifact to clipboard
// ─────────────────────────────────────────────────────────────────────────────

export const CopyPayloadSchema = makeSchema('copy', {
  /** What to copy: last | artifact:<id>. */
  args: z.array(z.string()).max(1).default([]),
  flags: typedFlags({
    /** Copy as markdown. */
    markdown: z.boolean().optional(),
    /** Copy as plain text. */
    plain: z.boolean().optional(),
  }),
});

export type CopyPayload = z.infer<typeof CopyPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 26. /config — Show or edit CLI configuration
// ─────────────────────────────────────────────────────────────────────────────

export const ConfigPayloadSchema = makeSchema('config', {
  /** Subcommand: get | set | list | reset. */
  args: z.array(z.string()).max(3).default([]),
  flags: typedFlags({
    /** Config key. */
    key: z.string().optional(),
    /** Config value to set. */
    value: z.string().optional(),
    /** Open config file in editor. */
    edit: z.boolean().optional(),
  }),
});

export type ConfigPayload = z.infer<typeof ConfigPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 27. /settings — Interactive settings editor
// ─────────────────────────────────────────────────────────────────────────────

export const SettingsPayloadSchema = makeSchema('settings', {
  /** Optional settings category to jump to. */
  args: z.array(z.string()).max(2).default([]),
  flags: typedFlags({
    /** List all settings without interactive mode. */
    list: z.boolean().optional(),
  }),
});

export type SettingsPayload = z.infer<typeof SettingsPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 28. /model — Switch the active language model
// ─────────────────────────────────────────────────────────────────────────────

export const ModelPayloadSchema = makeSchema('model', {
  /** Model identifier, e.g. "gemini-3.5-flash", "claude-opus-4". */
  args: z.array(z.string()).max(1).default([]),
  flags: typedFlags({
    /** List all available models. */
    list: z.boolean().optional(),
    /** Show current active model. */
    current: z.boolean().optional(),
  }),
});

export type ModelPayload = z.infer<typeof ModelPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 29. /effort — Set reasoning effort level
// ─────────────────────────────────────────────────────────────────────────────

export const EffortPayloadSchema = makeSchema('effort', {
  /** Effort level: low | medium | high | max. */
  args: z.array(z.enum(['low', 'medium', 'high', 'max'])).max(1).default([]),
  flags: typedFlags({
    /** Show current effort level. */
    current: z.boolean().optional(),
  }),
});

export type EffortPayload = z.infer<typeof EffortPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 30. /fast — Enable fast (non-thinking) mode
// ─────────────────────────────────────────────────────────────────────────────

export const FastPayloadSchema = makeSchema('fast', {
  args: z.array(z.string()).max(0).default([]),
  flags: typedFlags({
    /** Toggle off fast mode (return to thinking mode). */
    off: z.boolean().optional(),
  }),
});

export type FastPayload = z.infer<typeof FastPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 31. /permissions — Manage tool/filesystem permissions
// ─────────────────────────────────────────────────────────────────────────────

export const PermissionsPayloadSchema = makeSchema('permissions', {
  /** Subcommand: list | grant | revoke | reset. */
  args: z.array(z.enum(['list', 'grant', 'revoke', 'reset'])).max(1).default([]),
  flags: typedFlags({
    /** Permission target path or domain. */
    target: z.string().optional(),
    /** Permission action type. */
    action: z.enum(['read_file', 'write_file', 'command', 'read_url', 'execute_url']).optional(),
  }),
});

export type PermissionsPayload = z.infer<typeof PermissionsPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 32. /init — Initialize SDD context for current project
// ─────────────────────────────────────────────────────────────────────────────

export const InitPayloadSchema = makeSchema('init', {
  /** Optional project name override. */
  args: z.array(z.string()).max(3).default([]),
  flags: typedFlags({
    /** Force re-init even if already initialized. */
    force: z.boolean().optional(),
    /** Artifact store to bootstrap. */
    store: z.enum(['engram', 'openspec', 'hybrid', 'none']).optional(),
  }),
});

export type InitPayload = z.infer<typeof InitPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 33. /plan — Run SDD planning phases inline
// ─────────────────────────────────────────────────────────────────────────────

export const PlanPayloadSchema = makeSchema('plan', {
  /** Change name or topic. */
  args: z.array(z.string()).min(1, 'Change name is required').default([]),
  flags: typedFlags({
    /** Run fast-forward planning (all phases). */
    ff: z.boolean().optional(),
    /** Target phase: proposal | spec | design | tasks. */
    phase: z.enum(['proposal', 'spec', 'design', 'tasks']).optional(),
    /** Execution mode. */
    mode: z.enum(['interactive', 'auto']).optional(),
  }),
});

export type PlanPayload = z.infer<typeof PlanPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 34. /batch — Execute multiple commands from a file or inline list
// ─────────────────────────────────────────────────────────────────────────────

export const BatchPayloadSchema = makeSchema('batch', {
  /** Path to batch file or inline command list. */
  args: z.array(z.string()).min(1, 'Batch source is required').default([]),
  flags: typedFlags({
    /** Stop on first error. */
    'stop-on-error': z.boolean().optional(),
    /** Delay between commands in ms. */
    delay: z.coerce.number().int().min(0).optional(),
  }),
});

export type BatchPayload = z.infer<typeof BatchPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 35. /btw — Add a side note to the session log without triggering a response
// ─────────────────────────────────────────────────────────────────────────────

export const BtwPayloadSchema = makeSchema('btw', {
  /** The side note content. */
  args: z.array(z.string()).min(1, 'Note content is required').default([]),
  flags: typedFlags({
    /** Persist note to Engram memory. */
    persist: z.boolean().optional(),
  }),
});

export type BtwPayload = z.infer<typeof BtwPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 36. /tasks — Manage SDD task checklist
// ─────────────────────────────────────────────────────────────────────────────

export const TasksPayloadSchema = makeSchema('tasks', {
  /** Subcommand: list | check | uncheck | add | remove. */
  args: z.array(z.enum(['list', 'check', 'uncheck', 'add', 'remove'])).max(2).default([]),
  flags: typedFlags({
    /** Task ID or number. */
    id: z.string().optional(),
    /** Change name context. */
    change: z.string().optional(),
  }),
});

export type TasksPayload = z.infer<typeof TasksPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 37. /mcp — Manage MCP server connections and tools
// ─────────────────────────────────────────────────────────────────────────────

export const McpPayloadSchema = makeSchema('mcp', {
  /** Subcommand: list | connect | disconnect | tools | call. */
  args: z.array(z.enum(['list', 'connect', 'disconnect', 'tools', 'call'])).max(1).default([]),
  flags: typedFlags({
    /** MCP server name. */
    server: z.string().optional(),
    /** Tool name to call. */
    tool: z.string().optional(),
    /** JSON arguments for tool call. */
    args: z.string().optional(),
  }),
});

export type McpPayload = z.infer<typeof McpPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 38. /skills — List, install, or manage agent skills
// ─────────────────────────────────────────────────────────────────────────────

export const SkillsPayloadSchema = makeSchema('skills', {
  /** Subcommand: list | install | remove | update | info. */
  args: z.array(z.enum(['list', 'install', 'remove', 'update', 'info'])).max(2).default([]),
  flags: typedFlags({
    /** Skill name or path. */
    name: z.string().optional(),
    /** Show global skills. */
    global: z.boolean().optional(),
    /** Show project-local skills. */
    local: z.boolean().optional(),
  }),
});

export type SkillsPayload = z.infer<typeof SkillsPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 39. /agents — List and manage connected AI agents/terminals
// ─────────────────────────────────────────────────────────────────────────────

export const AgentsPayloadSchema = makeSchema('agents', {
  /** Subcommand: list | spawn | kill | info. */
  args: z.array(z.enum(['list', 'spawn', 'kill', 'info'])).max(2).default([]),
  flags: typedFlags({
    /** Agent conversation ID. */
    id: z.string().optional(),
    /** Agent type/model. */
    type: z.string().optional(),
  }),
});

export type AgentsPayload = z.infer<typeof AgentsPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 40. /diff — Show git diff or compare file versions
// ─────────────────────────────────────────────────────────────────────────────

export const DiffPayloadSchema = makeSchema('diff', {
  /** File paths or commit refs to diff. */
  args: z.array(z.string()).max(4).default([]),
  flags: typedFlags({
    /** Diff against a specific branch or commit. */
    against: z.string().optional(),
    /** Show only stat summary. */
    stat: z.boolean().optional(),
    /** Unified context lines. */
    unified: z.coerce.number().int().min(0).optional(),
  }),
});

export type DiffPayload = z.infer<typeof DiffPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 41. /review — Request a code review of staged changes or a file
// ─────────────────────────────────────────────────────────────────────────────

export const ReviewPayloadSchema = makeSchema('review', {
  /** Optional file or path to review. */
  args: z.array(z.string()).max(5).default([]),
  flags: typedFlags({
    /** Review focus area. */
    focus: z.enum(['security', 'performance', 'style', 'logic', 'all']).optional(),
    /** Review severity threshold. */
    severity: z.enum(['info', 'warning', 'error']).optional(),
  }),
});

export type ReviewPayload = z.infer<typeof ReviewPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 42. /code-review — Detailed code review with structured output
// ─────────────────────────────────────────────────────────────────────────────

export const CodeReviewPayloadSchema = makeSchema('code-review', {
  /** File(s) or PR reference to review. */
  args: z.array(z.string()).max(5).default([]),
  flags: typedFlags({
    /** Include accessibility checks. */
    a11y: z.boolean().optional(),
    /** Include test coverage gaps. */
    'check-coverage': z.boolean().optional(),
    /** Output format: inline | report | json. */
    output: z.enum(['inline', 'report', 'json']).optional(),
  }),
});

export type CodeReviewPayload = z.infer<typeof CodeReviewPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 43. /debug — Start an interactive debugging session
// ─────────────────────────────────────────────────────────────────────────────

export const DebugPayloadSchema = makeSchema('debug', {
  /** Error message, file path, or symptom description. */
  args: z.array(z.string()).min(1, 'Debug target is required').default([]),
  flags: typedFlags({
    /** Enable verbose trace output. */
    trace: z.boolean().optional(),
    /** Attach to a running process by PID. */
    pid: z.coerce.number().int().positive().optional(),
    /** Maximum debug iterations. */
    'max-iter': z.coerce.number().int().positive().optional(),
  }),
});

export type DebugPayload = z.infer<typeof DebugPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 44. /loop — Run a command in a loop until a condition is met
// ─────────────────────────────────────────────────────────────────────────────

export const LoopPayloadSchema = makeSchema('loop', {
  /** Command or goal to loop. */
  args: z.array(z.string()).min(1, 'Loop target is required').default([]),
  flags: typedFlags({
    /** Maximum iterations before auto-stop. */
    'max-iter': z.coerce.number().int().positive().optional(),
    /** Stop condition expression. */
    until: z.string().optional(),
    /** Delay between iterations in seconds. */
    delay: z.coerce.number().min(0).optional(),
  }),
});

export type LoopPayload = z.infer<typeof LoopPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 45. /claude-api — Make a direct Claude API call with custom params
// ─────────────────────────────────────────────────────────────────────────────

export const ClaudeApiPayloadSchema = makeSchema('claude-api', {
  /** Prompt to send. */
  args: z.array(z.string()).min(1, 'Prompt is required').default([]),
  flags: typedFlags({
    /** Model to use for the direct call. */
    model: z.string().optional(),
    /** Max tokens in response. */
    'max-tokens': z.coerce.number().int().positive().optional(),
    /** Temperature (0-1). */
    temperature: z.coerce.number().min(0).max(1).optional(),
    /** System prompt override. */
    system: z.string().optional(),
    /** Output raw JSON response. */
    raw: z.boolean().optional(),
  }),
});

export type ClaudeApiPayload = z.infer<typeof ClaudeApiPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 46. /cost — Show cost estimate for the current session
// ─────────────────────────────────────────────────────────────────────────────

export const CostPayloadSchema = makeSchema('cost', {
  /** Optional session ID or date range. */
  args: z.array(z.string()).max(2).default([]),
  flags: typedFlags({
    /** Show breakdown by model. */
    'by-model': z.boolean().optional(),
    /** Output in USD. */
    usd: z.boolean().optional(),
    /** Time period: today | week | month | all. */
    period: z.enum(['today', 'week', 'month', 'all']).optional(),
  }),
});

export type CostPayload = z.infer<typeof CostPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 47. /stats — Display session and system statistics
// ─────────────────────────────────────────────────────────────────────────────

export const StatsPayloadSchema = makeSchema('stats', {
  /** Optional stat category: tokens | requests | latency | errors. */
  args: z.array(z.enum(['tokens', 'requests', 'latency', 'errors', 'all'])).max(1).default([]),
  flags: typedFlags({
    /** Reset stats after display. */
    reset: z.boolean().optional(),
    /** Export stats to file. */
    export: z.string().optional(),
  }),
});

export type StatsPayload = z.infer<typeof StatsPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 48. /usage — Show token usage for current or past sessions
// ─────────────────────────────────────────────────────────────────────────────

export const UsagePayloadSchema = makeSchema('usage', {
  /** Optional session ID or model name to filter. */
  args: z.array(z.string()).max(2).default([]),
  flags: typedFlags({
    /** Break down by model. */
    'by-model': z.boolean().optional(),
    /** Show only input tokens. */
    input: z.boolean().optional(),
    /** Show only output tokens. */
    output: z.boolean().optional(),
    /** Time period filter: today | week | month | all. */
    period: z.enum(['today', 'week', 'month', 'all']).optional(),
  }),
});

export type UsagePayload = z.infer<typeof UsagePayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 49. /help — Display the full command catalog
// ─────────────────────────────────────────────────────────────────────────────

export const HelpPayloadSchema = makeSchema('help', {
  /** Optional specific command to show detailed help for. */
  args: z.array(z.string()).max(1).default([]),
  flags: typedFlags({
    /** Show help in compact single-line format. */
    compact: z.boolean().optional(),
    /** Filter by category. */
    category: z.enum([
      'session',
      'workspace',
      'planning',
      'config',
      'agents',
      'code',
      'metrics',
      'all',
    ]).optional(),
  }),
});

export type HelpPayload = z.infer<typeof HelpPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Schema registry — map command names to their Zod schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Central registry mapping each command name to its Zod validation schema.
 * Useful for dynamic dispatch in CommandPipeline.
 */
export const COMMAND_SCHEMA_REGISTRY = {
  grillme: GrillmePayloadSchema,
  goal: GoalPayloadSchema,
  planning: PlanningPayloadSchema,
  explore: ExplorePayloadSchema,
  verify: VerifyPayloadSchema,
  architect: ArchitectPayloadSchema,
  diagnose: DiagnosePayloadSchema,
  onboard: OnboardPayloadSchema,
  refactor: RefactorPayloadSchema,
  snapshot: SnapshotPayloadSchema,
  clear: ClearPayloadSchema,
  reset: ResetPayloadSchema,
  new: NewPayloadSchema,
  resume: ResumePayloadSchema,
  rename: RenamePayloadSchema,
  branch: BranchPayloadSchema,
  fork: ForkPayloadSchema,
  rewind: RewindPayloadSchema,
  exit: ExitPayloadSchema,
  quit: QuitPayloadSchema,
  compact: CompactPayloadSchema,
  context: ContextPayloadSchema,
  memory: MemoryPayloadSchema,
  export: ExportPayloadSchema,
  copy: CopyPayloadSchema,
  config: ConfigPayloadSchema,
  settings: SettingsPayloadSchema,
  model: ModelPayloadSchema,
  effort: EffortPayloadSchema,
  fast: FastPayloadSchema,
  permissions: PermissionsPayloadSchema,
  init: InitPayloadSchema,
  plan: PlanPayloadSchema,
  batch: BatchPayloadSchema,
  btw: BtwPayloadSchema,
  tasks: TasksPayloadSchema,
  mcp: McpPayloadSchema,
  skills: SkillsPayloadSchema,
  agents: AgentsPayloadSchema,
  diff: DiffPayloadSchema,
  review: ReviewPayloadSchema,
  'code-review': CodeReviewPayloadSchema,
  debug: DebugPayloadSchema,
  loop: LoopPayloadSchema,
  'claude-api': ClaudeApiPayloadSchema,
  cost: CostPayloadSchema,
  stats: StatsPayloadSchema,
  usage: UsagePayloadSchema,
  help: HelpPayloadSchema,
} as const;

export type CommandName = keyof typeof COMMAND_SCHEMA_REGISTRY;

/** Union type of all valid command payload types. */
export type AnyCommandPayload =
  | GrillmePayload
  | GoalPayload
  | PlanningPayload
  | ExplorePayload
  | VerifyPayload
  | ArchitectPayload
  | DiagnosePayload
  | OnboardPayload
  | RefactorPayload
  | SnapshotPayload
  | ClearPayload
  | ResetPayload
  | NewPayload
  | ResumePayload
  | RenamePayload
  | BranchPayload
  | ForkPayload
  | RewindPayload
  | ExitPayload
  | QuitPayload
  | CompactPayload
  | ContextPayload
  | MemoryPayload
  | ExportPayload
  | CopyPayload
  | ConfigPayload
  | SettingsPayload
  | ModelPayload
  | EffortPayload
  | FastPayload
  | PermissionsPayload
  | InitPayload
  | PlanPayload
  | BatchPayload
  | BtwPayload
  | TasksPayload
  | McpPayload
  | SkillsPayload
  | AgentsPayload
  | DiffPayload
  | ReviewPayload
  | CodeReviewPayload
  | DebugPayload
  | LoopPayload
  | ClaudeApiPayload
  | CostPayload
  | StatsPayload
  | UsagePayload
  | HelpPayload;
