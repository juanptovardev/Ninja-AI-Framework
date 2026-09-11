import { describe, it, expect, vi } from 'vitest';
import { runWithConcurrency } from './concurrency';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('runWithConcurrency', () => {
  it('runs every task and preserves input order in the settled results', async () => {
    const calls: number[] = [];
    const tasks = [1, 2, 3, 4, 5].map((value) => (): Promise<number> => {
      calls.push(value);
      return Promise.resolve(value * 10);
    });

    const results = await runWithConcurrency(tasks, 2);

    expect(calls.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : -1))).toEqual([
      10, 20, 30, 40, 50,
    ]);
  });

  it('never lets more than the limit of tasks be in flight at once', async () => {
    let active = 0;
    let maxActive = 0;
    const gates: Array<() => void> = [];
    const tasks = [1, 2, 3, 4].map((value) => {
      const gate = deferred();
      gates.push(gate.resolve);
      return (): Promise<number> => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        return gate.promise.then(() => {
          active -= 1;
          return value;
        });
      };
    });

    const pending = runWithConcurrency(tasks, 2);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(maxActive).toBe(2);

    gates[0]();
    gates[1]();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(maxActive).toBeLessThanOrEqual(2);

    gates[2]();
    gates[3]();
    const results = await pending;

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(results).toHaveLength(4);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('settles rejected tasks without aborting the remaining ones (allSettled semantics)', async () => {
    const tasks = [
      (): Promise<string> => Promise.reject(new Error('first fails')),
      (): Promise<string> => Promise.resolve('second ok'),
      (): Promise<string> => Promise.resolve('third ok'),
    ];

    const results = await runWithConcurrency(tasks, 2);

    expect(results[0]).toMatchObject({ status: 'rejected' });
    expect(results[0].status === 'rejected' && results[0].reason).toBeInstanceOf(Error);
    expect(results[1]).toMatchObject({ status: 'fulfilled', value: 'second ok' });
    expect(results[2]).toMatchObject({ status: 'fulfilled', value: 'third ok' });
  });

  it('returns an empty array for an empty task list', async () => {
    expect(await runWithConcurrency([], 4)).toEqual([]);
  });

  it('clamps a non-positive limit to 1 instead of running unbounded', async () => {
    const calls: number[] = [];
    const tasks = [1, 2].map((value) => (): Promise<number> => {
      calls.push(value);
      return Promise.resolve(value);
    });

    const results = await runWithConcurrency(tasks, 0);

    expect(calls.sort((a, b) => a - b)).toEqual([1, 2]);
    expect(results).toHaveLength(2);
  });

  it('reports rejection reason through the lambda inspection of vi', async () => {
    const task = vi.fn((): Promise<number> => Promise.reject(new Error('boom')));
    const results = await runWithConcurrency([task], 1);

    expect(task).toHaveBeenCalledTimes(1);
    expect(results[0].status).toBe('rejected');
  });
});
