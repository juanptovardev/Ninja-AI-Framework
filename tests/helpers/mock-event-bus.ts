import type { NinjaEvent, EventHandler, EventSubscription } from '@ninja/contracts';

export class MockEventBus {
  private emittedEvents: NinjaEvent[] = [];
  private handlers: Map<string, EventHandler<NinjaEvent>[]> = new Map();

  emit(event: NinjaEvent): void {
    this.emittedEvents.push(event);

    const targets = [
      ...(this.handlers.get(event.type) ?? []),
      ...(this.handlers.get('*') ?? []),
    ];

    for (const handler of targets) {
      try {
        void handler(event);
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
    this.handlers.set(type, [...existing, handler as EventHandler<NinjaEvent>]);

    const bus = this;
    return {
      id: `mock-sub-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      eventType: type,
      unsubscribe() {
        bus.off(handler as EventHandler<NinjaEvent>);
      },
    };
  }

  onAny(handler: EventHandler<NinjaEvent>): EventSubscription {
    return this.on('*', handler);
  }

  off(subscriptionIdOrHandler: string | EventHandler<NinjaEvent>): void {
    for (const [type, entries] of this.handlers.entries()) {
      const filtered = entries.filter((entry) => {
        if (typeof subscriptionIdOrHandler === 'string') {
          return true;
        }
        return entry !== subscriptionIdOrHandler;
      });
      if (typeof subscriptionIdOrHandler === 'string') {
        this.handlers.delete(type);
      } else if (filtered.length !== entries.length) {
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