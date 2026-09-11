/**
 * @ninja/events — bus.ts
 * EventBus en memoria para el Ninja AI Framework.
 *
 * Implementación simple, Single-process, sin persistencia ni WebSocket.
 * Cumple el contrato mínimo que necesita el Kage Runtime en Fase 1.
 *
 * Características:
 * - emit(): emite un evento a todos los handlers suscritos a ese tipo.
 * - emitBatch(): emite múltiples eventos eficientemente (agrupado por tipo)
 * - on(): suscribe un handler a un tipo de evento; devuelve EventSubscription.
 * - off(): cancela una suscripción por ID.
 * - clear(): elimina todos los handlers (util para tests).
 * - onAny(): suscribe un handler a TODOS los eventos (para logging global).
 * - setAutoBatch(): habilita auto-batch en modo burst (opcional, default false)
 * - history: historial de últimos 1000 eventos (trimming automático)
 */

import type { EventHandler, EventSubscription, NinjaEvent } from '@ninja/contracts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_HISTORY = 1000;
const BATCH_THRESHOLD_COUNT = 10;
const BATCH_THRESHOLD_MS = 100;

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Entrada interna que mapea un subscriptionId a su handler. */
interface SubscriptionEntry {
  id: string;
  eventType: string;
  handler: EventHandler<NinjaEvent>;
}

/**
 * Genera un ID de suscripción único y legible.
 * Usa crypto.randomUUID si está disponible (Node 14.17+), si no fallback con Math.random.
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// ---------------------------------------------------------------------------
// EventBus class
// ---------------------------------------------------------------------------

export class EventBus {
  /** Map de tipo de evento → lista de suscripciones. */
  private readonly _subscriptions = new Map<string, SubscriptionEntry[]>();

  /** Historial de eventos (máximo MAX_HISTORY entries) */
  private _history: NinjaEvent[] = [];

  /** Número total de eventos emitidos (para métricas básicas). */
  private _emitCount = 0;

  /** Auto-batch enabled flag */
  private _autoBatchEnabled = false;

  /** Timestamps de emits recientes para detección de burst */
  private _emitTimestamps: number[] = [];

  /** Buffer de eventos pendientes para batch */
  private _pendingBatch: NinjaEvent[] = [];

  /** Handle para flush de batch */
  private _batchFlushHandle: (() => void) | null = null;

  // ─── Core API ────────────────────────────────────────────────────────────

  /**
   * Emite un evento al bus.
   * Invoca todos los handlers suscritos al tipo del evento, más los globales ('*').
   * Los errores en handlers se capturan para no cortar el flujo de otros handlers.
   *
   * Si autoBatchEnabled es true y se detecta burst (>10 eventos en <100ms),
   * los eventos se acumulan y flush en la próxima microtask.
   */
  emit(event: NinjaEvent): void {
    // Agregar al historial con trimming
    this._addToHistory(event);

    // Auto-batch mode (opcional, default false)
    if (this._autoBatchEnabled) {
      const now = performance.now();
      this._emitTimestamps = this._emitTimestamps.filter((ts) => now - ts < BATCH_THRESHOLD_MS);
      this._emitTimestamps.push(now);

      // Detectar burst
      if (this._emitTimestamps.length > BATCH_THRESHOLD_COUNT) {
        this._pendingBatch.push(event);
        if (!this._batchFlushHandle) {
          this._batchFlushHandle = () => {
            queueMicrotask(() => {
              this._flushBatch();
              this._batchFlushHandle = null;
            });
          };
          this._batchFlushHandle();
        }
        return;
      }
    }

    // Emit normal (síncrono)
    this._emitCount++;
    this._invokeHandlers(event);
  }

  /**
   * Emite múltiples eventos eficientemente.
   * Agrupa eventos por tipo y llama handlers una sola vez por tipo.
   * Más eficiente que N llamadas a emit() para batches grandes.
   *
   * @param events Lista de eventos a emitir
   */
  emitBatch(events: NinjaEvent[]): void {
    if (events.length === 0) return;

    // Agregar todos al historial
    for (const event of events) {
      this._addToHistory(event);
    }

    this._emitCount += events.length;

    // Agrupar por tipo
    const byType = new Map<string, NinjaEvent[]>();
    for (const event of events) {
      const existing = byType.get(event.type) ?? [];
      existing.push(event);
      byType.set(event.type, existing);
    }

    // Invocar handlers para cada tipo
    for (const [type, typeEvents] of byType) {
      const entries = [
        ...(this._subscriptions.get(type) ?? []),
        ...(this._subscriptions.get('*') ?? []),
      ];

      for (const entry of entries) {
        for (const event of typeEvents) {
          try {
            void entry.handler(event);
          } catch (err) {
            console.error(
              `[EventBus] Handler error for event "${event.type}" (sub: ${entry.id}):`,
              err
            );
          }
        }
      }
    }
  }

  /**
   * Suscribe un handler a un tipo de evento.
   * @param type Tipo exacto del evento (ej. "runtime.started") o "*" para todos.
   * @param handler Función que recibe el evento.
   * @returns EventSubscription con método unsubscribe().
   */
  on<TEvent extends NinjaEvent = NinjaEvent>(
    type: string,
    handler: EventHandler<TEvent>
  ): EventSubscription {
    const existingSubs = this._subscriptions.get(type) ?? [];

    const id = generateId();

    const entry: SubscriptionEntry = {
      id,
      eventType: type,
      handler: handler as EventHandler<NinjaEvent>,
    };

    this._subscriptions.set(type, [...existingSubs, entry]);

    return {
      id,
      eventType: type,
      unsubscribe: () => {
        this.off(id);
      },
    };
  }

  /**
   * Suscribe un handler a TODOS los eventos del bus.
   * Útil para logging global, trazabilidad y Sentinel.
   */
  onAny(handler: EventHandler<NinjaEvent>): EventSubscription {
    return this.on('*', handler);
  }

  /**
   * Cancela una suscripción por su ID.
   * Si el ID no existe, no hace nada.
   */
  off(subscriptionId: string): void {
    for (const [type, entries] of this._subscriptions.entries()) {
      const filtered = entries.filter((e) => e.id !== subscriptionId);
      if (filtered.length !== entries.length) {
        if (filtered.length === 0) {
          this._subscriptions.delete(type);
        } else {
          this._subscriptions.set(type, filtered);
        }
        return; // IDs son únicos; encontrado → salir
      }
    }
  }

  /**
   * Elimina TODAS las suscripciones del bus.
   * Útil en tests o en shutdown ordenado del runtime.
   */
  clear(): void {
    this._subscriptions.clear();
    this._history = [];
    this._emitCount = 0;
  }

  /**
   * Habilita o deshabilita el auto-batch en modo burst.
   * Cuando está habilitado, si se emiten >10 eventos en <100ms,
   * se agrupan y flush en la próxima microtask.
   *
   * @param enabled Habilitar o deshabilitar auto-batch
   */
  setAutoBatch(enabled: boolean): void {
    this._autoBatchEnabled = enabled;
    if (enabled) {
      this._emitTimestamps = [];
      this._pendingBatch = [];
    }
  }

  // ─── Introspección ────────────────────────────────────────────────────────

  /** Número de tipos de eventos con al menos un handler activo. */
  get activeTypeCount(): number {
    return this._subscriptions.size;
  }

  /** Número total de suscripciones activas. */
  get subscriptionCount(): number {
    let total = 0;
    for (const entries of this._subscriptions.values()) {
      total += entries.length;
    }
    return total;
  }

  /** Número acumulado de eventos emitidos desde la creación del bus. */
  get emitCount(): number {
    return this._emitCount;
  }

  /** Historial de eventos (readonly, últimos MAX_HISTORY eventos) */
  get history(): readonly NinjaEvent[] {
    return this._history;
  }

  // ─── Internal Methods ────────────────────────────────────────────────────

  /**
   * Agrega un evento al historial con trimming automático
   */
  private _addToHistory(event: NinjaEvent): void {
    this._history.push(event);
    if (this._history.length > MAX_HISTORY) {
      // Trim: mantener últimos MAX_HISTORY
      this._history = this._history.slice(-MAX_HISTORY);
    }
  }

  /**
   * Invoca handlers para un evento (camino normal, no batch)
   */
  private _invokeHandlers(event: NinjaEvent): void {
    const targets = [
      ...(this._subscriptions.get(event.type) ?? []),
      ...(this._subscriptions.get('*') ?? []),
    ];

    for (const entry of targets) {
      try {
        void entry.handler(event);
      } catch (err) {
        console.error(
          `[EventBus] Handler error for event "${event.type}" (sub: ${entry.id}):`,
          err
        );
      }
    }
  }

  /**
   * Flushea el batch de eventos pendientes
   */
  private _flushBatch(): void {
    if (this._pendingBatch.length === 0) return;

    const batch = [...this._pendingBatch];
    this._pendingBatch = [];

    for (const event of batch) {
      this._invokeHandlers(event);
    }
  }
}

// ---------------------------------------------------------------------------
// Tipo estructural del bus
// ---------------------------------------------------------------------------

/**
 * Tipo estructural del EventBus para inyección en constructores y mocks.
 * Los consumidores usan este tipo en lugar de `EventBus` para permitir
 * mocks simples (la clase real tiene muchos miembros privados).
 */
export type EventBusLike = Pick<EventBus, 'emit' | 'on' | 'onAny' | 'off'>;

// ---------------------------------------------------------------------------
// Singleton de proceso
// ---------------------------------------------------------------------------

/**
 * Instancia singleton del EventBus para el proceso actual.
 * El Kage Runtime y sus módulos deben importar esta instancia.
 *
 * Para tests, usa `new EventBus()` directamente para instancias aisladas.
 */
export const eventBus = new EventBus();
