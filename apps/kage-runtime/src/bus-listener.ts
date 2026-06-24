import { eventBus } from '@ninja/events';
import { createLogger } from '@ninja/logging';
import type { NinjaEvent, RuntimeEvent } from '@ninja/contracts';

const log = createLogger('kage-runtime:bus-listener');

export function registerBusListeners(): { dispose(): void } {
  const subscriptions: Array<{ unsubscribe(): void }> = [];

  // Listener global para todos los eventos
  const globalSubscription = eventBus.onAny((event: NinjaEvent) => {
    log.debug(`[EVENT] ${event.type} from ${event.source}`, { id: event.id });
  });
  subscriptions.push(globalSubscription);

  // Listener específico para runtime.started
  const startedSubscription = eventBus.on('runtime.started', (event: RuntimeEvent) => {
    if (event.type !== 'runtime.started') {
      return;
    }
    log.info(`Runtime started on http://${event.payload.host}:${event.payload.port}`, {
      version: event.payload.version,
    });
  });
  subscriptions.push(startedSubscription);

  // Listener específico para runtime.error
  const errorSubscription = eventBus.on('runtime.error', (event: RuntimeEvent) => {
    if (event.type !== 'runtime.error') {
      return;
    }
    log.error(`Runtime error: ${event.payload.message}`, {
      code: event.payload.code,
      stack: event.payload.stack,
    });
  });
  subscriptions.push(errorSubscription);

  // Listener específico para runtime.stopping
  const stoppingSubscription = eventBus.on('runtime.stopping', () => {
    log.warn('Runtime stopping');
  });
  subscriptions.push(stoppingSubscription);

  return {
    dispose(): void {
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
    },
  };
}
