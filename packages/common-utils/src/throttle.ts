export interface ThrottledOptions {
  leading?: boolean;
  trailing?: boolean;
}

export interface Throttled<F extends (...args: never[]) => unknown> {
  (...args: Parameters<F>): void;
  cancel(): void;
  isThrottled(): boolean;
}

export function throttle<F extends (...args: never[]) => unknown>(
  fn: F,
  waitMs: number,
  options: ThrottledOptions = {}
): Throttled<F> {
  const leading = options.leading ?? true;
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

  function throttled(this: unknown, ...args: Parameters<F>): void {
    if (timer !== null) {
      lastArgs = args;
      // eslint-disable-next-line @typescript-eslint/no-this-alias -- stale-timer needs caller's this
      lastThis = this;
      return;
    }
    lastArgs = null;
    if (leading) {
      fn.apply(this, args);
    } else {
      lastArgs = args;
      // eslint-disable-next-line @typescript-eslint/no-this-alias -- stale-timer needs caller's this
      lastThis = this;
    }
    timer = setTimeout(run, waitMs);
  }

  function cancel(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    lastArgs = null;
  }

  function isThrottled(): boolean {
    return timer !== null;
  }

  throttled.cancel = cancel;
  throttled.isThrottled = isThrottled;
  return throttled;
}
