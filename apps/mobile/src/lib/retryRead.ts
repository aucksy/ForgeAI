/**
 * A screen's read, tried again before it gives up (phone test run 38144864717, part G).
 *
 * At app start the Workout tab showed "Couldn't load your routines" while a minute later the
 * same database read fine: a read can fail for a moment (the database busy with a write that
 * runs on its own connection right after launch — demo data, a restore, an import), and the
 * screen read once and then stayed on the error until the member tapped Try again.
 *
 * `readWithRetry` tries the read again after short pauses (300 ms, 1 s, 2.5 s by default) and
 * only then fails, so a passing hiccup never reaches the screen. A screen that still failed reads
 * again by itself when the app comes back to the front or something is saved
 * (`useRereadWhenFailed`).
 */

/** The pauses before each new try: four tries in all, about 3.8 s before an error shows. */
export const READ_RETRY_DELAYS_MS: readonly number[] = [300, 1000, 2500];

export interface RetryOptions {
  /** Pauses before each new try (one try more than there are pauses). */
  delays?: readonly number[];
  /** How to wait (tests pass their own). */
  wait?: (ms: number) => Promise<void>;
  /** False once nobody wants the answer (the screen closed, a newer read began): stop trying. */
  wanted?: () => boolean;
}

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/**
 * `read()`, tried again after each pause while it fails; the last failure is thrown. Stops early
 * (throwing the failure it has) when the answer is no longer wanted.
 */
export async function readWithRetry<T>(read: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const delays = opts.delays ?? READ_RETRY_DELAYS_MS;
  const wait = opts.wait ?? sleep;
  const wanted = opts.wanted ?? (() => true);
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (err) {
      if (attempt >= delays.length || !wanted()) throw err;
      await wait(delays[attempt]);
      if (!wanted()) throw err;
    }
  }
}
