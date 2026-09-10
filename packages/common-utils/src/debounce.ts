export interface DebouncedOptions {
  leading?: boolean;
  trailing?: boolean;
}

export interface Debounced<F extends (...args: never[]) => unknown> {
  (...args: Parameters<F>): void;
  cancel(): void;
  flush(): void;
  isPending(): boolean;
}

export function debounce<F extends (...args: never[]) => unknown>(
  fn: F,
  waitMs: number,
  options: DebouncedOptions = {}
): Debounced<F> {
  const leading = options.leading ?? false;
  const trailing = options.trailing ?? true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<F> | null = null;
  let lastThis: unknown;

  function run(): void {
    timer = null;
    if (!trailing || lastArgs === null) {
      lastArgs = null;
      return;
    }
    const args = lastArgs;
    const self = lastThis;
    lastArgs = null;
    fn.apply(self, args);
  }

  function debounced(this: unknown, ...args: Parameters<F>): void {
    lastArgs = args;
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- stale-timer needs caller's this, not call-time this
    lastThis = this;
    if (timer !== null) clearTimeout(timer);
    const shouldLead = leading && timer === null;
    timer = setTimeout(run, waitMs);
    if (shouldLead) fn.apply(this, args);
  }

  function cancel(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    lastArgs = null;
  }

  function flush(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (trailing && lastArgs !== null) {
      const args = lastArgs;
      const self = lastThis;
      lastArgs = null;
      fn.apply(self, args);
    }
  }

  function isPending(): boolean {
    return timer !== null;
  }

  debounced.cancel = cancel;
  debounced.flush = flush;
  debounced.isPending = isPending;
  return debounced;
}
