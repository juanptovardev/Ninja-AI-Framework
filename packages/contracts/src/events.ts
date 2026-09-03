/**
 * @ninja/contracts — events.ts
 * Contratos de tipos para el sistema de eventos del Ninja AI Framework.
 * Define NinjaEvent base, RuntimeEvent, EventHandler y EventSubscription.
 */

import type { ID, Timestamp } from './common.js';
import type { ReadyChecks, HealthReadyChangedPayload } from './runtime.js';

// ---------------------------------------------------------------------------
// Base Event
// ---------------------------------------------------------------------------

/**
 * Tipo base para todos los eventos que circulan por el bus interno.
 * Todos los eventos del sistema deben extender o conformar esta interfaz.
 */
export interface NinjaEvent<TPayload = unknown> {
  /** Identificador único del evento (UUID). */
  readonly id: ID;
  /** Tipo del evento. Uso de namespacing "dominio.accion" (ej. "runtime.started"). */
  readonly type: string;
  /** Módulo o componente que originó el evento (ej. "kage-runtime", "sentinel"). */
  readonly source: string;
  /** Timestamp ISO 8601 del momento en que se emitió el evento. */
  readonly timestamp: Timestamp;
  /** Datos específicos del evento. El tipo puede ser refinado por evento concreto. */
  readonly payload: TPayload;
}

// ---------------------------------------------------------------------------
// Runtime Events
// ---------------------------------------------------------------------------

/** Tipos de eventos emitidos por el Kage Runtime. */
export type RuntimeEventType =
  | 'runtime.started'
  | 'runtime.stopping'
  | 'runtime.stopped'
  | 'runtime.error'
  | 'runtime.health.check'
  | 'health.ready.changed';

/** Payload para runtime.started */
export interface RuntimeStartedPayload {
  readonly port: number;
  readonly host: string;
  readonly version: string;
}

/** Payload para runtime.error */
export interface RuntimeErrorPayload {
  readonly message: string;
  readonly code?: string;
  readonly stack?: string;
}

/** Payload para runtime.health.check */
export interface RuntimeHealthCheckPayload {
  readonly status: 'ok' | 'degraded' | 'error';
  readonly uptimeSeconds: number;
}

/**
 * Evento específico del Kage Runtime.
 * El tipo del payload varía según `type`.
 */
export type RuntimeEvent =
  | (NinjaEvent<RuntimeStartedPayload> & { readonly type: 'runtime.started' })
  | (NinjaEvent<Record<string, never>> & { readonly type: 'runtime.stopping' })
  | (NinjaEvent<Record<string, never>> & { readonly type: 'runtime.stopped' })
  | (NinjaEvent<RuntimeErrorPayload> & { readonly type: 'runtime.error' })
  | (NinjaEvent<RuntimeHealthCheckPayload> & { readonly type: 'runtime.health.check' })
  | (NinjaEvent<HealthReadyChangedPayload> & { readonly type: 'health.ready.changed' });

// ---------------------------------------------------------------------------
// Shell Events
// ---------------------------------------------------------------------------

/** Tipos de eventos emitidos por integrations-shell. */
export type ShellEventType =
  | 'shell.command.executed'
  | 'shell.command.blocked'
  | 'shell.command.timeout'
  | 'shell.command.error';

/** Payload para shell.command.executed */
export interface ShellCommandExecutedPayload {
  readonly cmd: string;
  readonly args: string[];
  readonly exitCode: number;
  readonly duration: number;
}

/** Payload para shell.command.blocked */
export interface ShellCommandBlockedPayload {
  readonly cmd: string;
  readonly args: string[];
  readonly reason: string;
}

/** Payload para shell.command.timeout */
export interface ShellCommandTimeoutPayload {
  readonly cmd: string;
  readonly args: string[];
  readonly timeout: number;
}

/**
 * Evento específico de Integrations Shell.
 */
export type ShellEvent =
  | (NinjaEvent<ShellCommandExecutedPayload> & { readonly type: 'shell.command.executed' })
  | (NinjaEvent<ShellCommandBlockedPayload> & { readonly type: 'shell.command.blocked' })
  | (NinjaEvent<ShellCommandTimeoutPayload> & { readonly type: 'shell.command.timeout' })
  | (NinjaEvent<{ message: string }> & { readonly type: 'shell.command.error' });

// ---------------------------------------------------------------------------
// Filesystem Events
// ---------------------------------------------------------------------------

/** Tipos de eventos emitidos por integrations-fs. */
export type FsEventType =
  | 'fs.file.written'
  | 'fs.file.deleted'
  | 'fs.directory.created'
  | 'fs.scan.completed'
  | 'fs.error';

/** Payload para fs.file.written */
export interface FsFileWrittenPayload {
  readonly path: string;
  readonly size: number;
}

/** Payload para fs.file.deleted */
export interface FsFileDeletedPayload {
  readonly path: string;
}

/** Payload para fs.scan.completed */
export interface FsScanCompletedPayload {
  readonly path: string;
  readonly fileCount: number;
  readonly duration: number;
}

/**
 * Evento específico de Integrations Filesystem.
 */
export type FsEvent =
  | (NinjaEvent<FsFileWrittenPayload> & { readonly type: 'fs.file.written' })
  | (NinjaEvent<FsFileDeletedPayload> & { readonly type: 'fs.file.deleted' })
  | (NinjaEvent<{ path: string }> & { readonly type: 'fs.directory.created' })
  | (NinjaEvent<FsScanCompletedPayload> & { readonly type: 'fs.scan.completed' })
  | (NinjaEvent<{ path: string; message: string }> & { readonly type: 'fs.error' });

// ---------------------------------------------------------------------------
// Handler & Subscription
// ---------------------------------------------------------------------------

/**
 * Función que maneja un evento del bus.
 * Puede ser síncrona o asíncrona.
 */
export type EventHandler<TEvent extends NinjaEvent = NinjaEvent> = (
  event: TEvent
) => void | Promise<void>;

/**
 * Referencia a una suscripción activa en el bus de eventos.
 * Permite cancelar la suscripción sin tener que pasar el handler original.
 */
export interface EventSubscription {
  /** Identificador único de esta suscripción. */
  readonly id: ID;
  /** Tipo de evento al que está suscrita. */
  readonly eventType: string;
  /** Función para cancelar esta suscripción. */
  unsubscribe(): void;
}
