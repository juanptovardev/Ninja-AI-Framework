/**
 * concurrency.ts — bounded parallel execution for the Flow Matrix executor.
 *
 * Runs a list of async tasks with a configurable concurrency limit using
 * Promise.allSettled semantics: every task settles, failures never abort the
 * remaining tasks, and the returned array preserves the input order (index i
 * corresponds to tasks[i]).
 */
export type Task<T> = () => Promise<T>;

/**
 * Executes {@link tasks} with at most {@link limit} of them in flight at once.
 *
 * @param tasks Tasks to run; the returned settled results map 1:1 (same index).
 * @param limit Maximum concurrent in-flight tasks. Values below 1 are clamped
 *              to 1 so the pool is never unbounded.
 * @returns An array of `Promise.allSettled` results in input order.
 */
export async function runWithConcurrency<T>(
  tasks: Task<T>[],
  limit: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array<PromiseSettledResult<T>>(tasks.length);
  if (tasks.length === 0) {
    return results;
  }

  const activeLimit = Math.max(1, Math.floor(limit));
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < tasks.length) {
      const current = cursor;
      cursor += 1;
      const task = tasks[current];
      const [settled] = await Promise.allSettled([task()]);
      results[current] = settled;
    }
  };

  const workers: Promise<void>[] = [];
  const workerCount = Math.min(activeLimit, tasks.length);
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}
