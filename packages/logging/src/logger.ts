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

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

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
  silent: 4,
};

// ---------------------------------------------------------------------------
// ANSI Colors (solo en TTY, ignoradas si la terminal no lo soporta)
// ---------------------------------------------------------------------------

const RESET = '\x1b[0m';
const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m', // green
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
  silent: '', // nivel de umbral: nunca se llama con él (no produce salida)
};

const isTTY =
  typeof process !== 'undefined' && process.stdout !== undefined && process.stdout.isTTY === true;

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
// Output format (WP-F2.7 — Manual §7.1: JSON 1-evento/línea)
// ---------------------------------------------------------------------------

export type LogFormatSetting = 'json' | 'pretty' | 'auto';

/** Campos reservados del formato JSON — el contexto no puede sobrescribirlos. */
const RESERVED_FIELDS = new Set(['ts', 'level', 'logger', 'msg']);

function readEnvFormat(): LogFormatSetting {
  const fromEnv = (
    typeof process !== 'undefined' ? process.env['NINJA_LOG_FORMAT'] : undefined
  )?.toLowerCase();
  if (fromEnv === 'json' || fromEnv === 'pretty') return fromEnv;
  return 'auto';
}

let _globalFormat: LogFormatSetting | null = null;

/**
 * Fija el formato global de salida ('json' | 'pretty' | 'auto'; null vuelve a auto).
 * 'auto' (default): pretty si stdout es TTY (dev), json si no (12-factor).
 */
export function setGlobalLogFormat(format: LogFormatSetting | null): void {
  _globalFormat = format;
}

/** Devuelve el ajuste de formato global configurado (null = auto). */
export function getGlobalLogFormat(): LogFormatSetting | null {
  return _globalFormat;
}

function resolveFormat(): 'json' | 'pretty' {
  const configured = _globalFormat ?? readEnvFormat();
  if (configured === 'json') return 'json';
  if (configured === 'pretty') return 'pretty';
  return isTTY ? 'pretty' : 'json';
}

/**
 * Serializa una entrada de log a JSON de 1 línea (Manual §7.1):
 * { ts, level, logger, msg, ...context, err?, args? }
 * Los campos reservados (ts/level/logger/msg) siempre ganan sobre el contexto.
 */
function toJsonLine(level: LogLevel, name: string, message: string, args: unknown[]): string {
  const entry: Record<string, unknown> = {};
  const extras: unknown[] = [];

  for (const arg of args) {
    if (arg instanceof Error) {
      entry['err'] = { name: arg.name, message: arg.message, stack: arg.stack };
    } else if (arg !== null && typeof arg === 'object') {
      for (const [key, value] of Object.entries(arg as Record<string, unknown>)) {
        if (!RESERVED_FIELDS.has(key)) {
          entry[key] = value;
        }
      }
    } else {
      extras.push(arg);
    }
  }
  if (extras.length > 0) {
    entry['args'] = extras;
  }

  entry['ts'] = new Date().toISOString();
  entry['level'] = level;
  entry['logger'] = name;
  entry['msg'] = message;

  return JSON.stringify(entry);
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

    if (resolveFormat() === 'json') {
      // Manual §7.1: un evento JSON por línea, directo a stdout/stderr.
      const line = toJsonLine(level, this.name, message, args);
      const consoleFn =
        level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      consoleFn(line);
      return;
    }

    const ts = new Date().toISOString();
    const lvlLabel = colorize(level, level.toUpperCase().padEnd(5));
    const nameLabel = `\x1b[90m[${this.name}]${RESET}`;
    const prefix = `${ts} ${lvlLabel} ${nameLabel}`;

    const consoleFn =
      level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;

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
