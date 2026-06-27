import path from 'node:path';
import { eventBus, createEvent } from '@ninja/events';
import { type ShellCommand } from './executor.js';

// WP-B12: deny-by-default allowlist. Only commands listed here are permitted.
// Extend via SHELL_ALLOWLIST_EXTRA env var (comma-separated command names).
const ALLOWED: Record<string, RegExp[]> = {
  // Git: read + safe write ops
  git: [/^(log|status|commit|diff|add|push|pull|checkout|branch|rev-parse|show|fetch|merge|tag|stash|remote|config|describe|shortlog|archive|ls-files|ls-tree|diff-index|format-patch|am|cherry-pick|rebase|bisect|worktree|submodule)$/],
  // Package managers
  npm:  [/^(run|ci|install|test|build|version|publish|--version|-v|exec|ls|audit|pack)$/],
  pnpm: [/^(run|install|build|test|typecheck|lint|--filter|--version|-v|exec|ls|audit|add|remove|update)$/],
  yarn: [/^(install|build|test|--version|-v|add|remove|upgrade)$/],
  bun:  [/^(run|install|build|test|--version|-v|add|remove)$/],
  // Node: only scripts (no -e, --eval flags — those allow arbitrary code execution)
  node: [/^[\w./\\-]+\.(mjs|cjs|js|ts)$/, /^--version$/, /^-v$/],
  tsx:  [/^[\w./\\-]+\.(ts|mts|cts)$/, /^--version$/],
  // FS read-only + low-risk
  echo: [/.*/],
  ls:   [/.*/],
  dir:  [/.*/],
  cat:  [/.*/],
  type: [/.*/],
  // FS write — controlled
  mkdir: [/.*/],
  cp:    [/.*/],
  mv:    [/.*/],
  copy:  [/.*/],
  // Tooling
  which: [/.*/],
  where: [/.*/],
  tsc:   [/.*/],
  turbo: [/.*/],
  vitest: [/.*/],
  playwright: [/.*/],
  prettier: [/.*/],
  eslint: [/.*/],
  rimraf: [/.*/],
};

const CRITICAL_PATHS = [
  '/etc', '/usr', '/bin', '/sbin', '/boot', '/root',
  'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)',
];

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
}

export function validateCommand(command: ShellCommand): ValidationResult {
  const rawCmd = command.cmd.toLowerCase();
  const cmdName = rawCmd.split(/[/\\]/).pop()!.replace(/\.(exe|bat|cmd)$/i, '');

  const extra = (process.env.SHELL_ALLOWLIST_EXTRA ?? '').split(',').filter(Boolean).map((s) => s.trim().toLowerCase());
  const patterns = ALLOWED[cmdName] ?? (extra.includes(cmdName) ? [/.*/] : null);

  if (!patterns) {
    const reason = `Command '${cmdName}' not in allowlist (deny-by-default WP-B12). ` +
      `Add to SHELL_ALLOWLIST_EXTRA to permit it.`;
    eventBus.emit(createEvent('shell.command.denied', 'integrations-shell', {
      cmd: cmdName,
      args: command.args,
      reason,
    }));
    return { allowed: false, reason };
  }

  // Validate first arg against per-command patterns (if non-trivial patterns defined)
  const hasSpecificPatterns = patterns.some((p) => p.source !== '.*');
  if (hasSpecificPatterns) {
    // WP-B12 follow-up: commands with specific patterns (node, tsx, git, npm, pnpm, ...)
    // require at least one argument. Otherwise binaries like `node` or `tsx` would
    // spawn an interactive REPL that reads code from stdin → arbitrary code execution
    // that bypasses the allowlist entirely.
    if (command.args.length === 0) {
      const reason = `Command '${cmdName}' requires an argument (interactive REPL / stdin-only mode forbidden — WP-B12)`;
      eventBus.emit(createEvent('shell.command.denied', 'integrations-shell', {
        cmd: cmdName,
        args: command.args,
        reason,
      }));
      return { allowed: false, reason };
    }
    const firstArg = command.args[0] ?? '';
    if (!patterns.some((p) => p.test(firstArg))) {
      const reason = `Command '${cmdName} ${firstArg}' first argument not in allowlist (WP-B12)`;
      eventBus.emit(createEvent('shell.command.denied', 'integrations-shell', {
        cmd: cmdName,
        args: command.args,
        reason,
      }));
      return { allowed: false, reason };
    }
  }

  // ── CWD validation (preserved from original) ────────────────────────────
  if (command.cwd) {
    try {
      const normalizedCwd = path.resolve(command.cwd);
      const workspaceRoot = process.cwd();

      if (!normalizedCwd.startsWith(workspaceRoot)) {
        return { allowed: false, reason: `CWD outside workspace: ${normalizedCwd}` };
      }

      for (const criticalPath of CRITICAL_PATHS) {
        if (normalizedCwd.includes(criticalPath)) {
          return { allowed: false, reason: `CWD in critical path: ${criticalPath}` };
        }
      }
    } catch (error) {
      return { allowed: false, reason: `CWD validation failed: ${(error as Error).message}` };
    }
  }

  // ── Shell metacharacter guard (Windows) ─────────────────────────────────
  if (process.platform === 'win32') {
    const fullCommand = `${command.cmd} ${command.args.join(' ')}`;
    let commandToTest = fullCommand;
    if (command.cmd === 'git') {
      commandToTest = `${command.cmd} ${command.args.map((arg) => {
        if (arg.startsWith('--pretty=format:') || arg.startsWith('--format=')) {
          return arg.replace(/\|/g, '_');
        }
        return arg;
      }).join(' ')}`;
    }
    if (/[&|;`$]/.test(commandToTest)) {
      return {
        allowed: false,
        reason: `Windows shell metacharacter detected in command: ${fullCommand}`,
      };
    }
  }

  return { allowed: true };
}
