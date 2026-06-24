/**
 * @ninja/contracts — runtime.ts
 * Contratos de tipos para el Kage Runtime.
 * Usados por el runtime local, sus endpoints HTTP y cualquier consumer del bus de eventos.
 */

import type { Timestamp } from './common.js';

// ---------------------------------------------------------------------------
// Runtime Status
// ---------------------------------------------------------------------------

/** Estados del ciclo de vida del Kage Runtime. */
export type RuntimeStatusValue =
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'error';

/**
 * Snapshot del estado del runtime en un momento dado.
 * Devuelto normalmente por el endpoint /status.
 */
export interface RuntimeStatus {
  /** Estado actual del proceso del runtime. */
  readonly status: RuntimeStatusValue;
  /** Versión semántica del runtime (ej. "1.0.0"). */
  readonly version: string;
  /** Segundos de uptime desde que arrancó el proceso. */
  readonly uptime: number;
  /** Timestamp ISO 8601 del momento en que se generó esta respuesta. */
  readonly timestamp: Timestamp;
}

// ---------------------------------------------------------------------------
// Health Response
// ---------------------------------------------------------------------------

/** Niveles de salud del sistema para el endpoint /health. */
export type HealthStatusValue = 'ok' | 'degraded' | 'error';

/**
 * Respuesta del endpoint /health del Kage Runtime.
 * Sigue la convención HTTP health-check estándar.
 */
export interface HealthResponse {
  /** Resultado de salud del sistema. */
  readonly status: HealthStatusValue;
  /** Timestamp ISO 8601 del momento en que se generó esta respuesta. */
  readonly timestamp: Timestamp;
}

// ---------------------------------------------------------------------------
// Runtime Config
// ---------------------------------------------------------------------------

/** Niveles de log permitidos en el runtime. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Configuración base para arrancar el Kage Runtime.
 * Extendida por la configuración concreta del servidor Fastify.
 */
export interface RuntimeConfig {
  /** Puerto TCP en el que escucha el runtime. Por defecto: 3141. */
  readonly port: number;
  /** Host de binding. Por defecto: "127.0.0.1" (local-only). */
  readonly host: string;
  /** Nivel mínimo de log que hace visible. Por defecto: "info". */
  readonly logLevel: LogLevel;
}

/** Valores por defecto para RuntimeConfig. */
export const DEFAULT_RUNTIME_CONFIG: Readonly<RuntimeConfig> = {
  port: 3141,
  host: '127.0.0.1',
  logLevel: 'info',
} as const;
