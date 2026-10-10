/**
 * ONE app-wide write queue (audit DS-04).
 *
 * Every transaction the app opens shares one SQLite connection. Two transactions that
 * overlap on it nest BEGINs ("cannot start a transaction within a transaction") and the
 * inner ROLLBACK can undo the OUTER work half-way — e.g. a history import still running
 * after Back while a workout is finished. Routing every transaction through this FIFO
 * guarantees one runs fully before the next begins.
 *
 * Rules:
 *  - FIFO: jobs run in the order they were enqueued, one at a time.
 *  - A failing job rejects ITS caller only; the next job still runs.
 *  - NO NESTING. JavaScript on Hermes has no async-local context, so the queue cannot tell
 *    "a job calling enqueueWrite" from "an unrelated caller arriving while a job runs".
 *    A job that awaited a nested enqueueWrite would wait for itself forever. So inside a
 *    job, call the plain (unqueued) helpers; only the outermost entry point enqueues.
 *    `inWriteQueue()` says whether a job is currently running (useful for asserts/tests).
 */

let tail: Promise<unknown> = Promise.resolve();
let running = 0;

export function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const job = async (): Promise<T> => {
    running++;
    try {
      return await fn();
    } finally {
      running--;
    }
  };
  const run = tail.then(job, job);
  tail = run.catch(() => undefined);
  return run;
}

/** True while a queued job is executing. */
export function inWriteQueue(): boolean {
  return running > 0;
}

/** Resolves once every job enqueued so far has finished (success or failure). */
export function writeQueueIdle(): Promise<void> {
  return tail.then(() => undefined);
}
