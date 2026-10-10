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
 *  - Readers share the connection, so a read while a job runs sees its uncommitted rows: never
 *    KEEP such a read (`writeQueueMark` / `quietSince`); a failed job tells `onWriteFailed`.
 */

let tail: Promise<unknown> = Promise.resolve();
let running = 0;
/** Jobs started so far (see `writeQueueMark`). */
let started = 0;
const failedListeners = new Set<() => void>();

export function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const job = async (): Promise<T> => {
    started++;
    running++;
    let failed = false;
    try {
      return await fn();
    } catch (e) {
      failed = true;
      throw e;
    } finally {
      running--;
      if (failed) tellWriteFailed();
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

/**
 * Audit Phase 8 review: a mark of the queue's quiet spell — null while a job runs, otherwise a
 * number that changes as soon as any job starts. A reader on the shared connection sees a
 * running job's UNCOMMITTED rows, and the job may still roll back; so anything kept in memory
 * (records, Targets, Home's and History's stamps) is kept only when the mark taken before the
 * read is non-null and still the same after it (`quietSince`).
 */
export function writeQueueMark(): number | null {
  return running > 0 ? null : started;
}

/** True when no job ran (or is running) since `mark` was taken. */
export function quietSince(mark: number | null): boolean {
  return mark != null && writeQueueMark() === mark;
}

/**
 * Audit Phase 8 review: called after a queued job FAILS (its transaction rolled back), once the
 * queue has moved on. What was read while it ran may have shown rows that are now gone: the
 * caches register here to drop what they hold, Home to read again. Returns "stop listening".
 */
export function onWriteFailed(listener: () => void): () => void {
  failedListeners.add(listener);
  return () => failedListeners.delete(listener);
}

function tellWriteFailed(): void {
  for (const l of [...failedListeners]) {
    try {
      l();
    } catch {
      // a listener's own failure never turns into the job's
    }
  }
}

/** Resolves once every job enqueued so far has finished (success or failure). */
export function writeQueueIdle(): Promise<void> {
  return tail.then(() => undefined);
}
