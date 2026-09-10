import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { throttle } from './throttle.js';

describe('throttle (WP-D1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('invoca al menos una vez al inicio de la ventana y una vez al final con los últimos args', async () => {
    const fn = vi.fn();
    const t = throttle(fn, 200);
    t('a');
    t('b');
    t('c');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('ignora llamadas dentro de la ventana activa', async () => {
    const fn = vi.fn();
    const t = throttle(fn, 100);
    t('a');
    await vi.advanceTimersByTimeAsync(50);
    t('b');
    t('c');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('una única llamada no se repite al cierre de la ventana (leading + trailing)', async () => {
    const fn = vi.fn();
    const t = throttle(fn, 100);
    t('x');
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(150);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('leading=false difiere hasta el final de la ventana', async () => {
    const fn = vi.fn();
    const t = throttle(fn, 100, { leading: false });
    t('a');
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('trailing=false descarta la cola y solo emite el leading', async () => {
    const fn = vi.fn();
    const t = throttle(fn, 100, { trailing: false });
    t('a');
    t('b');
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(150);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('isThrottled() refleja la ventana activa y cancel() la cierra', async () => {
    const fn = vi.fn();
    const t = throttle(fn, 100);
    t('a');
    expect(t.isThrottled()).toBe(true);
    t.cancel();
    expect(t.isThrottled()).toBe(false);
    t('b');
    expect(t.isThrottled()).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('cancel() descarta la invocación trailing pendiente', async () => {
    const fn = vi.fn();
    const t = throttle(fn, 100, { leading: false });
    t('a');
    t.cancel();
    await vi.advanceTimersByTimeAsync(150);
    expect(fn).not.toHaveBeenCalled();
  });

  it('preserva this del llamador', async () => {
    const fn = vi.fn(function (this: { tag: string }, _n: number) {
      return this.tag;
    });
    const t = throttle(fn, 100);
    t.call({ tag: 'ctx' }, 1);
    expect(fn).toHaveLastReturnedWith('ctx');
    await vi.advanceTimersByTimeAsync(100);
    t.call({ tag: 'ctx' }, 2);
    expect(fn).toHaveLastReturnedWith('ctx');
  });
});
