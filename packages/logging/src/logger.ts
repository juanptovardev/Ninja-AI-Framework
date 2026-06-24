/**
 * @ninja/logging — logger.ts
 * Logger mínimo y funcional para el Ninja AI Framework.
 *
 * Diseño:
 * - Sin dependencias externas (usa console nativo).
 * - Formato: [ISO timestamp] [LEVEL] [name] mensaje
 * - Niveles: debug < info < warn < error
 * - Factory pattern: createLogger(name) → Logger
 * - Nivel mínimo configurable por instancia o por variable de entorno LOG_LEVEL.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Interfaz pública de un logger. */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  /** Nombre del módulo al que pertenece este logger. */
  readonly name: string;
}

// ---------------------------------------------------------------------------
// Level ordering
// ---------------------------------------------------------------------------

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ---------------------------------------------------------------------------
// ANSI Colors (solo en TTY, ignoradas si la terminal no lo soporta)
// ---------------------------------------------------------------------------

const RESET = '\x1b[0m';
const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
};

const isTTY =
  typeof process !== 'undefined' &&
  process.stdout !== undefined &&
  process.stdout.isTTY === true;

function colorize(level: LogLevel, text: string): string {
  if (!isTTY) return text;
  return `${COLORS[level]}${text}${RESET}`;
}

// ---------------------------------------------------------------------------
// Global minimum log level (from env or default)
// ---------------------------------------------------------------------------

function resolveGlobalLevel(): LogLevel {
  const fromEnv = (
    typeof process !== 'undefined' ? process.env['LOG_LEVEL'] : undefined
  )?.toLowerCase();

  if (fromEnv && fromEnv in LEVEL_ORDER) {
    return fromEnv as LogLevel;
  }
  return 'info';
}

let _globalMinLevel: LogLevel = resolveGlobalLevel();

/** Cambia el nivel mínimo global de todos los loggers. */
export function setGlobalLogLevel(level: LogLevel): void {
  _globalMinLevel = level;
}

/** Devuelve el nivel mínimo global actual. */
export function getGlobalLogLevel(): LogLevel {
  return _globalMinLevel;
}

// ---------------------------------------------------------------------------
// Logger implementation
// ---------------------------------------------------------------------------

class NinjaLogger implements Logger {
  readonly name: string;
  private readonly _minLevel: LogLevel | null;

  constructor(name: string, minLevel?: LogLevel) {
    this.name = name;
    this._minLevel = minLevel ?? null;
  }

  private _isEnabled(level: LogLevel): boolean {
    const effective = this._minLevel ?? _globalMinLevel;
    return LEVEL_ORDER[level] >= LEVEL_ORDER[effective];
  }

  private _log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (!this._isEnabled(level)) return;

    const ts = new Date().toISOString();
    const lvlLabel = colorize(level, level.toUpperCase().padEnd(5));
    const nameLabel = `\x1b[90m[${this.name}]${RESET}`;
    const prefix = `${ts} ${lvlLabel} ${nameLabel}`;

    const consoleFn =
      level === 'error'
        ? console.error
        : level === 'warn'
        ? console.warn
        : console.log;

    if (args.length > 0) {
      consoleFn(`${prefix} ${message}`, ...args);
    } else {
      consoleFn(`${prefix} ${message}`);
    }
  }

  debug(message: string, ...args: unknown[]): void {
    this._log('debug', message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this._log('info', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this._log('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this._log('error', message, ...args);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Crea un logger con nombre de módulo.
 *
 * @param name     Nombre del módulo (ej. "kage-runtime", "sentinel").
 * @param minLevel Nivel mínimo opcional. Si se omite, usa el nivel global.
 *
 * @example
 * const log = createLogger('kage-runtime');
 * log.info('Server started on port 3141');
 * log.error('Boot failed', { reason: 'port taken' });
 */
export function createLogger(name: string, minLevel?: LogLevel): Logger {
  return new NinjaLogger(name, minLevel);
}
