import { describe, expect, it, vi } from 'vitest';
import { createEvent } from '@ninja/events';
import { MockEventBus } from './mock-event-bus.js';

describe('MockEventBus', () => {
  it('removes only the requested subscription when handlers share an event type', () => {
    const bus = new MockEventBus();
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    const firstSubscription = bus.on('runtime.started', firstHandler);
    bus.on('runtime.started', secondHandler);
    bus.off(firstSubscription.id);

    bus.emit(createEvent('runtime.started', 'test', {
      port: 3141,
      host: 'localhost',
      version: 'test',
      wsEndpoint: 'ws://localhost:3141/ws/events',
    }));

    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledTimes(1);
  });
});
