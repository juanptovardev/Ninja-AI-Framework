import { type ShellCommand, type ShellResult } from './executor.js';
import { createLogger } from '@ninja/logging';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Nivel de severidad para el log de ejecuciones */
export type ShellLogSeverity = 'info' | 'warn' | 'error';

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const logger = createLogger('shell');

/**
 * Registra la ejecución de un comando de shell.
 *
 * @param command Comando ejecutado
 * @param result Resultado de la ejecución
 */
export function logExecution(command: ShellCommand, result: ShellResult): void {
  // Truncar outputs largos para evitar logs muy grandes
  const truncatedStdout =
    result.stdout.length > 2000
      ? result.stdout.substring(0, 2000) + '...[TRUNCATED]'
      : result.stdout;

  const truncatedStderr =
    result.stderr.length > 2000
      ? result.stderr.substring(0, 2000) + '...[TRUNCATED]'
      : result.stderr;

  logger.info('Shell command executed', {
    cmd: command.cmd,
    args: command.args,
    exitCode: result.exitCode,
    duration: result.duration,
    stdout: truncatedStdout,
    stderr: truncatedStderr,
  });
}
