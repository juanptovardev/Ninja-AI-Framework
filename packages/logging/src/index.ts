/**
 * @ninja/logging — index.ts
 * Public API del paquete de logging del Ninja AI Framework.
 *
 * Uso en otros packages:
 *   import { createLogger, setGlobalLogLevel } from '@ninja/logging';
 *   import type { Logger, LogLevel } from '@ninja/logging';
 */

export {
  createLogger,
  setGlobalLogLevel,
  getGlobalLogLevel,
  setGlobalLogFormat,
  getGlobalLogFormat,
} from './logger';

export type { Logger, LogLevel, LogFormatSetting } from './logger';
