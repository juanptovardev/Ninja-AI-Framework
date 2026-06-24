/**
 * @ninja/events — helpers.ts
 * Funciones de utilidad para crear eventos tipados del bus.
 */

import type { NinjaEvent } from '@ninja/contracts';

/**
 * Genera un ID de evento único.
 * Compatible con Node 14.17+ y entornos sin WebCrypto.
 */
function generateEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Crea un NinjaEvent correctamente formado listos para emitir al bus.
 *
 * @param type     Tipo del evento (ej. "runtime.started").
 * @param source   Módulo emisor (ej. "kage-runtime").
 * @param payload  Datos específicos del evento.
 */
export function createEvent<TPayload = unknown>(
  type: string,
  source: string,
  payload: TPayload
): NinjaEvent<TPayload> {
  return {
    id: generateEventId(),
    type,
    source,
    timestamp: new Date().toISOString(),
    payload,
  };
}
