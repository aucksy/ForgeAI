/**
 * R-164: when the phone shares its workouts with gym mates, and that switching it off deletes them
 * at once (kept and sent again with no signal).
 */
import { describe, expect, it } from 'vitest';

import { createMateSharer, MATE_EVERY_MS, MATE_RETRY_MS, mateDue, type MateDeps, type MateSendResult } from '@/shop/mateShare';

function rig(over: Partial<MateDeps> = {}, start: { on?: boolean; pending?: boolean } = {}) {
  const state = { now: 1_000_000, on: start.on ?? true, pending: start.pending ?? false, sent: 0, stops: 0, builds: 0 };
  let sendResult: MateSendResult = 'ok';
  let stopResult: MateSendResult = 'ok';
  const deps: MateDeps = {
    now: () => state.now,
    memberKey: async () => 'key-1',
    isDemo: async () => false,
    shareOn: () => state.on,
    pending: () => state.pending,
    clearPending: () => {
      state.pending = false;
    },
    build: async () => {
      state.builds += 1;
      return { bio: null, workouts: [] };
    },
    send: async () => {
      state.sent += 1;
      return sendResult;
    },
    stop: async () => {
      state.stops += 1;
      return stopResult;
    },
    log: () => undefined,
    ...over,
  };
  const s = createMateSharer(deps);
  return {
    s,
    state,
    setSend: (r: MateSendResult) => (sendResult = r),
    setStop: (r: MateSendResult) => (stopResult = r),
  };
}

describe('mateDue', () => {
  it('waits 6 hours, a minute after a failure, and not at all for a pending switch', () => {
    expect(mateDue(10, null, null, false)).toBe(true);
    expect(mateDue(MATE_EVERY_MS - 1, 0, null, false)).toBe(false);
    expect(mateDue(MATE_EVERY_MS, 0, null, false)).toBe(true);
    expect(mateDue(5, 0, null, true)).toBe(true);
    expect(mateDue(5, null, 10, true)).toBe(false);
  });
});

describe('createMateSharer', () => {
  it('switch off: nothing is built or sent', async () => {
    const r = rig({}, { on: false });
    expect(await r.s.share('workout')).toBe('off');
    expect(await r.s.share('start')).toBe('off');
    expect(r.state.builds + r.state.sent + r.state.stops).toBe(0);
  });

  it('switch on: at once after a workout and the switch; start and return wait 6 hours', async () => {
    const r = rig({}, { pending: true });
    expect(await r.s.share('setting')).toBe('sent');
    expect(r.state.pending).toBe(false);
    expect(await r.s.share('start')).toBe('throttled');
    expect(await r.s.share('workout')).toBe('sent');
    r.state.now += MATE_EVERY_MS;
    expect(await r.s.share('active')).toBe('sent');
    expect(r.state.sent).toBe(3);
  });

  it('switch off with the gym not told yet: stop is sent, again on the next start until it lands', async () => {
    const r = rig({}, { on: false, pending: true });
    r.setStop('failed');
    expect(await r.s.share('setting')).toBe('failed');
    expect(r.state.pending).toBe(true);
    expect(await r.s.share('start')).toBe('off'); // the minute after a failure
    r.state.now += MATE_RETRY_MS;
    r.setStop('ok');
    expect(await r.s.share('start')).toBe('cleared');
    expect(r.state.pending).toBe(false);
    expect(r.state.stops).toBe(2);
    expect(r.state.sent).toBe(0);
  });

  it('a server without 0040: sharing stops for the run, but an off is still cleared', async () => {
    const r = rig({}, { pending: true });
    r.setSend('missing');
    expect(await r.s.share('setting')).toBe('stopped');
    expect(await r.s.share('workout')).toBe('stopped');
    r.state.on = false;
    r.setStop('missing');
    expect(await r.s.share('setting')).toBe('cleared');
    expect(r.state.pending).toBe(false);
  });

  it('never with the sample data, and not without a gym', async () => {
    expect(await rig({ isDemo: async () => true }).s.share('workout')).toBe('demo');
    expect(await rig({ memberKey: async () => null }).s.share('workout')).toBe('no-gym');
  });

  it('one at a time: a workout saved while one is out runs right after it', async () => {
    let release: () => void = () => undefined;
    const r = rig();
    let calls = 0;
    const gate = new Promise<void>((res) => (release = res));
    const deps = rig({
      send: async () => {
        calls += 1;
        if (calls === 1) await gate;
        return 'ok';
      },
    });
    const first = deps.s.share('setting');
    expect(await deps.s.share('workout')).toBe('busy');
    release();
    expect(await first).toBe('sent');
    expect(calls).toBe(2);
    expect(r.state.sent).toBe(0);
  });
});
