import { type ChildProcess, type SpawnOptions, spawn } from 'node:child_process';
import { type NinjaEvent } from '@ninja/contracts';
import { eventBus, createEvent } from '@ninja/events';
import { createLogger } from '@ninja/logging';
import { validateCommand } from './sandbox.js';
import { logExecution } from './logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShellCommand {
  /** Comando a ejecutar (ej: "npm", "git", "ls") */
  cmd: string;
  /** Argumentos del comando (ej: ["install", "react"]) */
  args: string[];
  /** Directorio de trabajo (default: process.cwd()) */
  cwd?: string;
  /** Timeout en milisegundos (default: 30000) */
  timeout?: number;
  /** Variables de entorno adicionales */
  env?: Record<string, string>;
}

export interface ShellResult {
  /** Código de salida del proceso */
  exitCode: number;
  /** Salida estándar completa del comando */
  stdout: string;
  /** Salida de error del comando */
  stderr: string;
  /** Duración de ejecución en milisegundos */
  duration: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ShellCommandBlockedError extends Error {
  constructor(reason: string) {
    super(`Shell command blocked: ${reason}`);
    this.name = 'ShellCommandBlockedError';
  }
}

export class ShellTimeoutError extends Error {
  constructor(timeout: number) {
    super(`Shell command timed out after ${timeout}ms`);
    this.name = 'ShellTimeoutError';
  }
}

export class ShellSpawnError extends Error {
  constructor(message: string) {
    super(`Failed to spawn shell command: ${message}`);
    this.name = 'ShellSpawnError';
  }
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const logger = createLogger('shell');

let workspaceRoot: string | null = null;

// Mapa de procesos activos para poder hacer cleanup
const activeProcesses = new Map<number, ChildProcess>();

/**
 * Obtiene el directorio raíz del workspace actual.
 * En entorno de desarrollo, usa el directorio del proyecto.
 */
export function getWorkspaceRoot(): string {
  if (workspaceRoot) {
    return workspaceRoot;
  }

  // En entorno real, esto vendría de configuración
  workspaceRoot = process.cwd();
  return workspaceRoot;
}

/**
 * Establece el directorio raíz del workspace.
 */
export function setWorkspaceRoot(root: string): void {
  workspaceRoot = root;
}

/**
 * Ejecuta un comando de shell de forma segura y controlada.
 *
 * @param command Comando y parámetros a ejecutar
 * @returns Resultado de la ejecución
 * @throws ShellCommandBlockedError si el comando está bloqueado
 * @throws ShellTimeoutError si se excede el timeout
 * @throws ShellSpawnError si falla la ejecución del proceso
 */
export async function executeCommand(command: ShellCommand): Promise<ShellResult> {
  const startTime = Date.now();

  // Validación sandbox
  const validation = validateCommand(command);
  if (!validation.allowed) {
    const error = new ShellCommandBlockedError(validation.reason!);
    eventBus.emit(
      createEvent('shell.command.blocked', 'shell', {
        cmd: command.cmd,
        args: command.args,
        reason: validation.reason,
      })
    );
    throw error;
  }

  return new Promise((resolve, reject) => {
    // Configurar timeout
    const timeout = command.timeout ?? 30000;
    const controller = new AbortController();

  // Configurar spawn
  const env = createSecureEnvironment(command.env);
  const options: SpawnOptions = {
    cwd: command.cwd ?? process.cwd(),
    env: env,
    signal: controller.signal,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...(process.platform === 'win32' ? { shell: true } : {}),
  };

    // Iniciar proceso
    const child = spawn(command.cmd, command.args, options);

    // Registrar proceso para posible cleanup
    if (child.pid !== undefined) {
      activeProcesses.set(child.pid, child);
    }

    // Capturar output
    let stdout = '';
    let stderr = '';
    let stdoutSize = 0;
    let stderrSize = 0;
    const MAX_BUFFER_SIZE = 5 * 1024 * 1024; // 5MB

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdoutSize < MAX_BUFFER_SIZE) {
        const chunkStr = chunk.toString('utf8');
        const availableSpace = MAX_BUFFER_SIZE - stdoutSize;
        if (stdout.length + chunkStr.length > availableSpace) {
          // Truncar si excede límite
          const toAdd = chunkStr.substring(0, availableSpace);
          stdout += toAdd;
          stdoutSize += toAdd.length;
          if (stdoutSize >= MAX_BUFFER_SIZE) {
            stdout = '[OUTPUT TRUNCATED BY NINJA] ' + stdout;
          }
        } else {
          stdout += chunkStr;
          stdoutSize += chunkStr.length;
        }
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderrSize < MAX_BUFFER_SIZE) {
        const chunkStr = chunk.toString('utf8');
        const availableSpace = MAX_BUFFER_SIZE - stderrSize;
        if (stderr.length + chunkStr.length > availableSpace) {
          // Truncar si excede límite
          const toAdd = chunkStr.substring(0, availableSpace);
          stderr += toAdd;
          stderrSize += toAdd.length;
          if (stderrSize >= MAX_BUFFER_SIZE) {
            stderr = '[OUTPUT TRUNCATED BY NINJA] ' + stderr;
          }
        } else {
          stderr += chunkStr;
          stderrSize += chunkStr.length;
        }
      }
    });

    // Configurar timeout
    const timeoutId = setTimeout(() => {
      controller.abort();
      eventBus.emit(
        createEvent('shell.command.timeout', 'shell', {
          cmd: command.cmd,
          args: command.args,
          timeout: timeout,
        })
      );
      reject(new ShellTimeoutError(timeout));
    }, timeout);

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      if (child.pid !== undefined) {
        activeProcesses.delete(child.pid);
      }
      reject(new ShellSpawnError(error.message));
    });

    child.on('close', async (code, signal) => {
      clearTimeout(timeoutId);
      if (child.pid !== undefined) {
        activeProcesses.delete(child.pid);
      }

      const duration = Date.now() - startTime;
      const result: ShellResult = {
        exitCode: code ?? (signal ? 1 : 0),
        stdout,
        stderr,
        duration,
      };

      // Loggear ejecución
      logExecution(command, result);

      // Emitir evento de éxito
      eventBus.emit(
        createEvent('shell.command.executed', 'shell', {
          cmd: command.cmd,
          args: command.args,
          exitCode: result.exitCode,
          duration: result.duration,
        })
      );

      resolve(result);
    });
  });
}

/**
 * Crea un entorno seguro para ejecución de comandos.
 * Solo incluye variables de entorno permitidas.
 */
function createSecureEnvironment(env: Record<string, string> = {}): NodeJS.ProcessEnv {
  const whitelist = [
    'PATH',
    'HOME',
    'USER',
    'LANG',
    'NODE_ENV',
    'SHELL',
    'TEMP',
    'TMP',
    'TMPDIR',
    'TERM',
    'TERM_PROGRAM',
    'GIT_PAGER',
    'PAGER',
    'COMSPEC',
    'SYSTEMROOT',
    'WINDIR',
  ];

  // Variables de entorno base
  const baseEnv: NodeJS.ProcessEnv = {};

  // Copiar variables de whitelist desde process.env
  for (const key of whitelist) {
    const value = process.env[key];
    if (value !== undefined) {
      baseEnv[key] = value;
    }
  }

  // Añadir variables personalizadas
  return { ...baseEnv, ...env };
}
