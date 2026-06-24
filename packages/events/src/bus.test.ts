import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus, createEvent } from './index.js';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('subscribe and emit — handler called with correct payload', () => {
    const handler = vi.fn();
    bus.on('test.event', handler);

    const event = createEvent('test.event', 'test-module', { value: 42 });
    bus.emit(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
    expect(handler.mock.calls[0][0].payload).toEqual({ value: 42 });
  });

  it('unsubscribe — handler not called after unsubscription', () => {
    const handler = vi.fn();
    const sub = bus.on('test.event', handler);
    sub.unsubscribe();

    bus.emit(createEvent('test.event', 'test', {}));

    expect(handler).not.toHaveBeenCalled();
  });

  it('emit with typed payload — verifies NinjaEvent<T> shape', () => {
    const handler = vi.fn();
    bus.on('test.event', handler);

    const event = createEvent('test.event', 'source-name', { foo: 'bar' });
    bus.emit(event);

    const received = handler.mock.calls[0][0];
    expect(received).toHaveProperty('id');
    expect(typeof received.id).toBe('string');
    expect(received).toHaveProperty('type', 'test.event');
    expect(received).toHaveProperty('source', 'source-name');
    expect(received).toHaveProperty('timestamp');
    expect(typeof received.timestamp).toBe('string');
    expect(received).toHaveProperty('payload');
    expect(received.payload).toEqual({ foo: 'bar' });
  });

  it('multiple subscribers receive the same event', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const handler3 = vi.fn();

    bus.on('test.event', handler1);
    bus.on('test.event', handler2);
    bus.on('test.event', handler3);

    const event = createEvent('test.event', 'test', { n: 1 });
    bus.emit(event);

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler1).toHaveBeenCalledWith(event);
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledWith(event);
    expect(handler3).toHaveBeenCalledTimes(1);
    expect(handler3).toHaveBeenCalledWith(event);
  });

  it('emit with no subscribers does not throw', () => {
    expect(() => {
      bus.emit(createEvent('unregistered.type', 'test', {}));
    }).not.toThrow();
  });

  it('emitCount tracks total emissions', () => {
    expect(bus.emitCount).toBe(0);

    bus.emit(createEvent('a', 'test', {}));
    bus.emit(createEvent('b', 'test', {}));
    bus.emit(createEvent('c', 'test', {}));

    expect(bus.emitCount).toBe(3);
  });

  it('onAny handler receives all events', () => {
    const handler = vi.fn();
    bus.onAny(handler);

    bus.emit(createEvent('alpha', 'test', { x: 1 }));
    bus.emit(createEvent('beta', 'test', { y: 2 }));

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('wildcard subscription via on("*") receives all events', () => {
    const handler = vi.fn();
    bus.on('*', handler);

    bus.emit(createEvent('anything', 'test', {}));
    bus.emit(createEvent('everything', 'test', {}));

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('error in one handler does not prevent other handlers from being called', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const errorHandler = vi.fn(() => { throw new Error('handler error'); });
    const goodHandler = vi.fn();

    bus.on('test.event', errorHandler);
    bus.on('test.event', goodHandler);

    expect(() => {
      bus.emit(createEvent('test.event', 'test', {}));
    }).not.toThrow();

    expect(goodHandler).toHaveBeenCalledTimes(1);
    vi.mocked(console.error).mockRestore();
  });

  it('clear removes all subscriptions', () => {
    const handler = vi.fn();
    bus.on('a', handler);
    bus.on('b', handler);

    expect(bus.subscriptionCount).toBe(2);
    expect(bus.activeTypeCount).toBe(2);

    bus.clear();

    expect(bus.subscriptionCount).toBe(0);
    expect(bus.activeTypeCount).toBe(0);
  });

  it('off with non-existent id does not throw', () => {
    expect(() => bus.off('non-existent-id')).not.toThrow();
  });

  it('subscriptionCount and activeTypeCount reflect active subscriptions', () => {
    expect(bus.subscriptionCount).toBe(0);
    expect(bus.activeTypeCount).toBe(0);

    bus.on('type.a', vi.fn());
    expect(bus.subscriptionCount).toBe(1);
    expect(bus.activeTypeCount).toBe(1);

    bus.on('type.a', vi.fn());
    expect(bus.subscriptionCount).toBe(2);
    expect(bus.activeTypeCount).toBe(1);

    bus.on('type.b', vi.fn());
    expect(bus.subscriptionCount).toBe(3);
    expect(bus.activeTypeCount).toBe(2);
  });
});