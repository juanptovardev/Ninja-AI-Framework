import path from 'node:path';
import { type ShellCommand } from './executor.js';

const BLOCKED_COMMANDS = [
  'rm -rf /',
  'format',
  'del /F',
  'shutdown',
  'mkfs',
  'dd',
  'mkntfs',
  'mkfs.ntfs',
  'rm -rf /*',
  'rm -rf .',
  'rm -rf ..',
  ':(){ :|:& };:',
];

const CRITICAL_PATHS = [
  '/etc',
  '/usr',
  '/bin',
  '/sbin',
  '/boot',
  '/root',
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
];

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
}

export function validateCommand(command: ShellCommand): ValidationResult {
  const fullCommand = `${command.cmd} ${command.args.join(' ')}`;
  for (const blocked of BLOCKED_COMMANDS) {
    const isSimpleWord = /^[a-zA-Z0-9_\-\.]+$/.test(blocked);
    if (isSimpleWord) {
      const regex = new RegExp(`(^|[^a-zA-Z0-9_\\-=])${blocked}($|[^a-zA-Z0-9_\\-])`, 'i');
      if (regex.test(fullCommand)) {
        const reason = `Command contains blocked pattern: ${blocked}`;
        return { allowed: false, reason };
      }
    } else {
      if (fullCommand.includes(blocked)) {
        const reason = `Command contains blocked pattern: ${blocked}`;
        return { allowed: false, reason };
      }
    }
  }

  if (command.cwd) {
    try {
      const normalizedCw = path.resolve(command.cwd);
      const workspaceRoot = process.cwd();

      if (!normalizedCw.startsWith(workspaceRoot)) {
        const reason = `CWD outside workspace: ${normalizedCw}`;
        return { allowed: false, reason };
      }

      for (const criticalPath of CRITICAL_PATHS) {
        if (normalizedCw.includes(criticalPath)) {
          const reason = `CWD in critical path: ${criticalPath}`;
          return { allowed: false, reason };
        }
      }
    } catch (error) {
      const reason = `CWD validation failed: ${(error as Error).message}`;
      return { allowed: false, reason };
    }
  }

  for (const arg of command.args) {
    if (arg.includes('>') || arg.includes('>>') || arg.includes('|')) {
      const unsafePaths = ['/', '/etc/', '/usr/', '/bin/', '/sbin/', '/boot/'];
      for (const unsafePath of unsafePaths) {
        if (arg.includes(unsafePath)) {
          const reason = `Unsafe redirection to ${unsafePath}`;
          return { allowed: false, reason };
        }
      }
    }

    const destructiveFlags = ['--force', '-f', '--no-preserve-root', '--delete'];
    if (destructiveFlags.includes(arg)) {
      const reason = `Destructive flag detected: ${arg}`;
      return { allowed: false, reason };
    }
  }

  if (process.platform === 'win32') {
    let commandToTest = fullCommand;
    if (command.cmd === 'git') {
      commandToTest = `${command.cmd} ${command.args.map(arg => {
        if (arg.startsWith('--pretty=format:') || arg.startsWith('--format=')) {
          return arg.replace(/\|/g, '_');
        }
        return arg;
      }).join(' ')}`;
    }
    const SHELL_METACHAR_PATTERN = /[&|;`$]/;
    if (SHELL_METACHAR_PATTERN.test(commandToTest)) {
      return {
        allowed: false,
        reason: `Windows shell metacharacter detected in command: ${fullCommand}`,
      };
    }
  }

  return { allowed: true };
}
