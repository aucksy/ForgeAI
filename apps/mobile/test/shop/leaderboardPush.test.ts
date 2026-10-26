/**
 * R-133: when the phone sends its day totals (src/shop/leaderboardPush.ts): only in a gym, never for
 * demo data, at most every 10 minutes on start / the Gym tab, at once after a workout or the name
 * switch, quiet failures, and no more tries once the server says the function does not exist.
 */
import { describe, expect, it } from 'vitest';

import type { BoardDay } from '@/shop/leaderboard';
import { PUSH_EVERY_MS, PUSH_RETRY_MS, createBoardPusher, pushDue, waitsForThrottle, type PushDeps, type SendResult } from '@/shop/leaderboardPush';

const DAYS: BoardDay[] = [{ d: '2026-10-25', w: 1, kg: 3000 }];

function setup(over: Partial<PushDeps> = {}) {
  const clock = { now: 1_000_000 };
  const sent: { key: string; days: BoardDay[]; showName: boolean }[] = [];
  const logs: string[] = [];
  const name = { on: false, pending: false };
  let next: SendResult = 'ok';
  const deps: PushDeps = {
    now: () => clock.now,
    memberKey: async () => 'key-1',
    isDemo: async () => false,
    days: async () => DAYS,
    showName: () => name.on,
    namePending: () => name.pending,
    clearNamePending: () => {
      name.pending = false;
    },
    send: async (key, days, showName) => {
      sent.push({ key, days, showName });
      return next;
    },
    log: (m) => logs.push(m),
    ...over,
  };
  return {
    clock,
    sent,
    logs,
    name,
    setNext: (r: SendResult) => {
      next = r;
    },
    pusher: createBoardPusher(deps),
  };
}

describe('the throttle rule', () => {
  it('a pending name change ignores the 10 minutes (not a failed try\'s minute)', () => {
    expect(pushDue(1000, 0, null, true)).toBe(true);
    expect(pushDue(1000, 0, null, false)).toBe(false);
    expect(pushDue(1000, 0, 2000, true)).toBe(false);
  });

  it('start and tab visits wait, a workout and the switch do not', () => {
    expect(waitsForThrottle('start')).toBe(true);
    expect(waitsForThrottle('active')).toBe(true);
    expect(waitsForThrottle('focus')).toBe(true);
    expect(waitsForThrottle('workout')).toBe(false);
    expect(waitsForThrottle('setting')).toBe(false);
  });

  it('due when never sent, or 10 minutes have passed, and not while a failed try is cooling', () => {
    expect(pushDue(5, null, null)).toBe(true);
    expect(pushDue(PUSH_EVERY_MS - 1, 0, null)).toBe(false);
    expect(pushDue(PUSH_EVERY_MS, 0, null)).toBe(true);
    expect(pushDue(PUSH_EVERY_MS, 0, PUSH_EVERY_MS + 1)).toBe(false);
  });
});

describe('sending', () => {
  it('sends the key, the days and the name switch', async () => {
    const t = setup();
    t.name.on = true;
    expect(await t.pusher.push('focus')).toBe('sent');
    expect(t.sent).toEqual([{ key: 'key-1', days: DAYS, showName: true }]);
  });

  it('at most once every 10 minutes on start and Gym tab visits', async () => {
    const t = setup();
    expect(await t.pusher.push('start')).toBe('sent');
    t.clock.now += 5 * 60 * 1000;
    expect(await t.pusher.push('focus')).toBe('throttled');
    t.clock.now += 5 * 60 * 1000;
    expect(await t.pusher.push('focus')).toBe('sent');
    expect(t.sent).toHaveLength(2);
  });

  it('after a workout or the name switch it goes at once, inside the 10 minutes', async () => {
    const t = setup();
    await t.pusher.push('start');
    t.clock.now += 1000;
    expect(await t.pusher.push('workout')).toBe('sent');
    expect(await t.pusher.push('setting')).toBe('sent');
    expect(t.sent).toHaveLength(3);
  });

  it('a push after a workout starts the 10 minutes again', async () => {
    const t = setup();
    await t.pusher.push('workout');
    t.clock.now += 60 * 1000;
    expect(await t.pusher.push('focus')).toBe('throttled');
  });

  it('a phone in no gym sends nothing and does not even read its workouts', async () => {
    let read = false;
    const t = setup({
      memberKey: async () => null,
      days: async () => {
        read = true;
        return DAYS;
      },
    });
    expect(await t.pusher.push('workout')).toBe('no-gym');
    expect(t.sent).toEqual([]);
    expect(read).toBe(false);
  });

  it('sample (demo) data is never sent, and its workouts are never read', async () => {
    let read = false;
    const t = setup({
      isDemo: async () => true,
      days: async () => {
        read = true;
        return DAYS;
      },
    });
    for (const trigger of ['start', 'focus', 'workout', 'setting'] as const) expect(await t.pusher.push(trigger)).toBe('demo');
    expect(t.sent).toEqual([]);
    expect(read).toBe(false);
  });

  it('a new gym (another member key) is not held back by the old one\'s 10 minutes', async () => {
    let key = 'key-1';
    const t = setup({ memberKey: async () => key });
    await t.pusher.push('focus');
    key = 'key-2';
    expect(await t.pusher.push('focus')).toBe('sent');
    expect(t.sent.map((s) => s.key)).toEqual(['key-1', 'key-2']);
  });

  it('one at a time: a workout saved while a push is out is sent right after it', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let calls = 0;
    const t = setup({
      send: async () => {
        calls += 1;
        if (calls === 1) await gate;
        return 'ok';
      },
    });
    const first = t.pusher.push('start');
    await Promise.resolve();
    await Promise.resolve();
    expect(await t.pusher.push('focus')).toBe('busy');
    expect(await t.pusher.push('workout')).toBe('busy');
    release();
    expect(await first).toBe('sent');
    expect(calls).toBe(2);
  });
});

describe('failures', () => {
  it('a failure is not thrown and not shown; the next start or tab visit waits a minute', async () => {
    const t = setup();
    t.setNext('failed');
    expect(await t.pusher.push('start')).toBe('failed');
    t.clock.now += PUSH_RETRY_MS - 1;
    expect(await t.pusher.push('focus')).toBe('throttled');
    t.clock.now += 1;
    t.setNext('ok');
    expect(await t.pusher.push('focus')).toBe('sent');
  });

  it('a workout after a failure still tries at once', async () => {
    const t = setup();
    t.setNext('failed');
    await t.pusher.push('start');
    t.setNext('ok');
    expect(await t.pusher.push('workout')).toBe('sent');
  });

  it('a reading or sending error that throws is caught and logged as [board]', async () => {
    const t = setup({
      days: async () => {
        throw new Error('db is busy');
      },
    });
    expect(await t.pusher.push('workout')).toBe('failed');
    expect(t.logs[0]).toMatch(/^\[board\]/);
  });
});

describe('a name switch made with no signal', () => {
  it('keeps trying on start, coming back and the Gym tab, without the 10 minutes, until it is sent', async () => {
    const t = setup();
    await t.pusher.push('start'); // an earlier push went fine
    t.name.pending = true;
    t.setNext('failed');
    expect(await t.pusher.push('setting')).toBe('failed');
    expect(t.name.pending).toBe(true);
    t.clock.now += PUSH_RETRY_MS;
    expect(await t.pusher.push('active')).toBe('failed');
    expect(t.name.pending).toBe(true);
    t.clock.now += PUSH_RETRY_MS;
    t.setNext('ok');
    expect(await t.pusher.push('focus')).toBe('sent');
    expect(t.name.pending).toBe(false);
    // Heard: the 10 minutes apply again.
    t.clock.now += 1000;
    expect(await t.pusher.push('focus')).toBe('throttled');
  });

  it('it is cleared only when the value that was sent is still the one chosen', async () => {
    const t = setup();
    t.name.pending = true;
    t.name.on = false;
    const flipped = createBoardPusher({
      now: () => t.clock.now,
      memberKey: async () => 'key-1',
      isDemo: async () => false,
      days: async () => DAYS,
      showName: () => t.name.on,
      namePending: () => t.name.pending,
      clearNamePending: () => {
        t.name.pending = false;
      },
      send: async () => {
        t.name.on = true; // flipped again while this push was out
        return 'ok';
      },
      log: () => undefined,
    });
    expect(await flipped.push('setting')).toBe('sent');
    expect(t.name.pending).toBe(true);
  });

  it('sample data: nothing is sent and the pending mark is dropped (the next real push carries the switch)', async () => {
    const t = setup({ isDemo: async () => true });
    t.name.pending = true;
    expect(await t.pusher.push('setting')).toBe('demo');
    expect(t.name.pending).toBe(false);
  });
});

describe('a server without the leaderboard yet', () => {
  it('stops for the rest of the run: nothing more is read or sent', async () => {
    let reads = 0;
    const t = setup({
      days: async () => {
        reads += 1;
        return DAYS;
      },
    });
    t.setNext('missing');
    expect(await t.pusher.push('start')).toBe('stopped');
    expect(t.pusher.stopped()).toBe(true);
    expect(t.logs[0]).toMatch(/^\[board\]/);
    t.setNext('ok');
    t.clock.now += 3 * PUSH_EVERY_MS;
    for (const trigger of ['start', 'focus', 'workout', 'setting'] as const) expect(await t.pusher.push(trigger)).toBe('stopped');
    expect(t.sent).toHaveLength(1);
    expect(reads).toBe(1);
  });
});
