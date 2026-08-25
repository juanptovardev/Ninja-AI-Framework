import type { NinjaEvent, EventHandler, EventSubscription } from '@ninja/contracts';

interface MockSubscriptionEntry {
  id: string;
  handler: EventHandler<NinjaEvent>;
}

let mockSubCounter = 0;

export class MockEventBus {
  private emittedEvents: NinjaEvent[] = [];
  private handlers: Map<string, MockSubscriptionEntry[]> = new Map();

  emit(event: NinjaEvent): void {
    this.emittedEvents.push(event);

    const targets = [
      ...(this.handlers.get(event.type) ?? []),
      ...(this.handlers.get('*') ?? []),
    ];

    for (const entry of targets) {
      try {
        void entry.handler(event);
      } catch {
        // No propagamos errores de handlers individuales en el mock
      }
    }
  }

  on<TEvent extends NinjaEvent = NinjaEvent>(
    type: string,
    handler: EventHandler<TEvent>
  ): EventSubscription {
    const existing = this.handlers.get(type) ?? [];
    const id = `mock-sub-${Date.now()}-${++mockSubCounter}-${Math.random().toString(36).slice(2)}`;
    this.handlers.set(type, [...existing, { id, handler: handler as EventHandler<NinjaEvent> }]);

    const bus = this;
    return {
      id,
      eventType: type,
      unsubscribe() {
        bus.off(id);
      },
    };
  }

  onAny(handler: EventHandler<NinjaEvent>): EventSubscription {
    return this.on('*', handler);
  }

  off(subscriptionIdOrHandler: string | EventHandler<NinjaEvent>): void {
    for (const [type, entries] of this.handlers.entries()) {
      const filtered = entries.filter((entry) =>
        typeof subscriptionIdOrHandler === 'string'
          ? entry.id !== subscriptionIdOrHandler
          : entry.handler !== subscriptionIdOrHandler
      );
      if (filtered.length !== entries.length) {
        if (filtered.length === 0) {
          this.handlers.delete(type);
        } else {
          this.handlers.set(type, filtered);
        }
        return;
      }
    }
  }

  clear(): void {
    this.emittedEvents = [];
    this.handlers.clear();
  }

  getEvents(name?: string): NinjaEvent[] {
    if (name === undefined) {
      return [...this.emittedEvents];
    }
    return this.emittedEvents.filter((e) => e.type === name);
  }
}
