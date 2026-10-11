/**
 * Phone test run 38144864717 (part G): at app start the Workout tab showed "Couldn't load your
 * routines" while the same read worked a minute later. Screens now try a failed read again
 * (300 ms, 1 s, 2.5 s) before showing the error, and a screen still failed reads again after the
 * next save (`onWriteDone`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { READ_RETRY_DELAYS_MS, readWithRetry } from '@/lib/retryRead';

const noWait = () => {
  const waits: number[] = [];
  return { waits, wait: async (ms: number) => void waits.push(ms) };
};

describe('readWithRetry: a passing hiccup never reaches the screen', () => {
  it('the default pauses are 300 ms, 1 s and 2.5 s', () => {
    expect(READ_RETRY_DELAYS_MS).toEqual([300, 1000, 2500]);
  });

  it('a read that works first time is read once, with no pause', async () => {
    const { waits, wait } = noWait();
    const read = vi.fn(async () => ['Push Pull Legs']);
    await expect(readWithRetry(read, { wait })).resolves.toEqual(['Push Pull Legs']);
    expect(read).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });

  it('a read that fails twice then works gives the answer, after the first two pauses', async () => {
    const { waits, wait } = noWait();
    let n = 0;
    const read = vi.fn(async () => {
      n++;
      if (n < 3) throw new Error('database is locked');
      return 'routines';
    });
    await expect(readWithRetry(read, { wait })).resolves.toBe('routines');
    expect(read).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([300, 1000]);
  });

  it('a read that keeps failing is tried four times, then its last failure is thrown', async () => {
    const { waits, wait } = noWait();
    let n = 0;
    const read = vi.fn(async () => {
      n++;
      throw new Error(`fail ${n}`);
    });
    await expect(readWithRetry(read, { wait })).rejects.toThrow('fail 4');
    expect(read).toHaveBeenCalledTimes(4);
    expect(waits).toEqual([300, 1000, 2500]);
  });

  it('stops trying once the answer is no longer wanted (the screen closed)', async () => {
    const { waits, wait } = noWait();
    let wanted = true;
    const read = vi.fn(async () => {
      wanted = false;
      throw new Error('locked');
    });
    await expect(readWithRetry(read, { wait, wanted: () => wanted })).rejects.toThrow('locked');
    expect(read).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });

  it('stops when the screen closes during a pause', async () => {
    let wanted = true;
    const read = vi.fn(async () => {
      throw new Error('locked');
    });
    const wait = async () => {
      wanted = false;
    };
    await expect(readWithRetry(read, { wait, wanted: () => wanted })).rejects.toThrow('locked');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('really waits with the default pauses (fake clock)', async () => {
    vi.useFakeTimers();
    try {
      let n = 0;
      const read = vi.fn(async () => {
        n++;
        if (n < 2) throw new Error('locked');
        return 'ok';
      });
      const p = readWithRetry(read);
      await vi.advanceTimersByTimeAsync(299);
      expect(read).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(p).resolves.toBe('ok');
      expect(read).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('onWriteDone: a failed screen reads again after the next save', () => {
  beforeEach(() => vi.resetModules());

  it('tells listeners after a job that saved, not after one that failed, and stops when asked', async () => {
    const { enqueueWrite, onWriteDone, writeQueueIdle } = await import('@/db/writeQueue');
    const done = vi.fn();
    const stop = onWriteDone(done);
    await enqueueWrite(async () => 'saved');
    expect(done).toHaveBeenCalledTimes(1);
    await enqueueWrite(async () => {
      throw new Error('rolled back');
    }).catch(() => undefined);
    await writeQueueIdle();
    expect(done).toHaveBeenCalledTimes(1);
    stop();
    await enqueueWrite(async () => 'again');
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("a listener's own failure never fails the save", async () => {
    const { enqueueWrite, onWriteDone } = await import('@/db/writeQueue');
    const stop = onWriteDone(() => {
      throw new Error('listener broke');
    });
    await expect(enqueueWrite(async () => 42)).resolves.toBe(42);
    stop();
  });
});
