/**
 * @ninja/events — index.ts
 * Public API del paquete de eventos del Ninja AI Framework.
 *
 * Uso en otros packages:
 *   import { eventBus, EventBus, createEvent } from '@ninja/events';
 *   import type { NinjaEvent, EventHandler, EventSubscription } from '@ninja/contracts';
 */

// Bus de eventos (clase + singleton)
export { EventBus, eventBus } from './bus';

// Helpers de fábrica
export { createEvent } from './helpers';

// Re-export de tipos de contratos relevantes para comodidad de consumers
export type {
  NinjaEvent,
  RuntimeEvent,
  RuntimeEventType,
  RuntimeStartedPayload,
  RuntimeErrorPayload,
  RuntimeHealthCheckPayload,
  EventHandler,
  EventSubscription,
} from '@ninja/contracts';
