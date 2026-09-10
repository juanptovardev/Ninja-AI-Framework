import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from './debounce.js';

describe('debounce (WP-D1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('no invoca hasta que hay silencio (trailing por defecto)', async () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);
    d('a');
    d('b');
    d('c');
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(199);
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('cada llamada reinicia la ventana', async () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('1');
    await vi.advanceTimersByTimeAsync(90);
    d('2');
    await vi.advanceTimersByTimeAsync(90);
    d('3');
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('3');
  });

  it('leading=true invoca inmediatamente la primera llamada del burst', async () => {
    const fn = vi.fn();
    const d = debounce(fn, 200, { leading: true });
    d('a');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
    await vi.advanceTimersByTimeAsync(250);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('leading=true con trailing=false invoca una sola vez (sin cola)', async () => {
    const fn = vi.fn();
    const d = debounce(fn, 200, { leading: true, trailing: false });
    d('a');
    d('b');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
    await vi.advanceTimersByTimeAsync(250);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('un solo burst con leading+trailing dispara dos veces (lodash semantics)', async () => {
    const fn = vi.fn();
    const d = debounce(fn, 100, { leading: true, trailing: true });
    d('x');
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('cancel() descarta la invocación pendiente', async () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('a');
    expect(d.isPending()).toBe(true);
    d.cancel();
    expect(d.isPending()).toBe(false);
    await vi.advanceTimersByTimeAsync(150);
    expect(fn).not.toHaveBeenCalled();
  });

  it('flush() ejecuta inmediatamente la invocación pendiente', async () => {
    const fn = vi.fn();
    const d = debounce(fn, 1000);
    d('a');
    d.flush();
    expect(fn).toHaveBeenCalledWith('a');
    await vi.advanceTimersByTimeAsync(1200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('preserva this del llamador', async () => {
    const fn = vi.fn(function (this: { tag: string }, _n: number) {
      return this.tag;
    });
    const d = debounce(fn, 100);
    d.call({ tag: 'ctx' }, 1);
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveLastReturnedWith('ctx');
  });
});
