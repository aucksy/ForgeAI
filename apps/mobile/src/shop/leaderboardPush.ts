/**
 * When the phone sends its day totals to the gym (R-133). No native imports: everything it needs
 * comes in as `deps`, so the rules are tested without a phone or a server (leaderboardSync.ts wires
 * the real ones).
 *
 *  - Only a phone that joined a gym, and never with the sample (demo) data.
 *  - On app start, coming back to the app and on the Gym tab: at most once every 10 minutes, unless
 *    the name switch changed and the gym has not heard yet (then every time, so an "off" made with no
 *    signal keeps trying). After a workout is saved, or
 *    after the member flips the name switch: at once (a workout that is not counted yet would read
 *    as a bug), one at a time; a second request while one is out runs right after it.
 *  - A failure is one quiet log line, never shown. After a failure the next start/tab visit waits a
 *    minute. A server that says the function does not exist (0037 not live) is left alone for the
 *    rest of this run.
 */
import type { BoardDay } from './leaderboard';

export type PushTrigger = 'start' | 'active' | 'focus' | 'workout' | 'setting';
export type PushOutcome = 'sent' | 'throttled' | 'no-gym' | 'demo' | 'stopped' | 'failed' | 'busy';
export type SendResult = 'ok' | 'missing' | 'failed';

export const PUSH_EVERY_MS = 10 * 60 * 1000;
export const PUSH_RETRY_MS = 60 * 1000;

export interface PushDeps {
  now: () => number;
  /** The phone's member key, or null when it is not in a gym. */
  memberKey: () => Promise<string | null>;
  isDemo: () => Promise<boolean>;
  days: () => Promise<BoardDay[]>;
  showName: () => boolean;
  /** The name switch changed and the gym has not heard yet (kept on the phone). */
  namePending: () => boolean;
  clearNamePending: () => void;
  send: (key: string, days: BoardDay[], showName: boolean) => Promise<SendResult>;
  log: (message: string, detail?: unknown) => void;
}

/** Does this trigger wait for the 10 minutes? PURE. */
export function waitsForThrottle(t: PushTrigger): boolean {
  return t === 'start' || t === 'active' || t === 'focus';
}

/**
 * May a throttled trigger go now? `sentAt` / `retryAt`: when this member's last push went / may be
 * tried again (ms). `namePending`: the name switch changed and the gym has not heard: the 10 minutes
 * no longer apply (a failed try still waits its minute). PURE.
 */
export function pushDue(now: number, sentAt: number | null, retryAt: number | null, namePending = false): boolean {
  if (retryAt != null && now < retryAt) return false;
  return namePending || sentAt == null || now - sentAt >= PUSH_EVERY_MS;
}

export function createBoardPusher(deps: PushDeps): {
  push: (t: PushTrigger) => Promise<PushOutcome>;
  stopped: () => boolean;
} {
  let stopped = false;
  let inFlight = false;
  let again = false;
  let sentAt: { key: string; at: number } | null = null;
  let retryAt: { key: string; at: number } | null = null;

  async function attempt(t: PushTrigger): Promise<PushOutcome> {
    const key = await deps.memberKey();
    if (!key) return 'no-gym';
    const now = deps.now();
    if (waitsForThrottle(t) && !pushDue(now, sentAt?.key === key ? sentAt.at : null, retryAt?.key === key ? retryAt.at : null, deps.namePending())) return 'throttled';
    if (await deps.isDemo()) {
      // Nothing is sent for sample data; the first real push carries the switch anyway.
      deps.clearNamePending();
      return 'demo';
    }
    const days = await deps.days();
    const showName = deps.showName();
    const r = await deps.send(key, days, showName);
    if (r === 'missing') {
      stopped = true;
      deps.log('[board] the gym server has no leaderboard yet; not trying again this time');
      return 'stopped';
    }
    if (r === 'failed') {
      retryAt = { key, at: deps.now() + PUSH_RETRY_MS };
      return 'failed';
    }
    sentAt = { key, at: deps.now() };
    // Heard: unless the member flipped it again while this was out (the next push carries that one).
    if (deps.showName() === showName) deps.clearNamePending();
    return 'sent';
  }

  async function guarded(t: PushTrigger): Promise<PushOutcome> {
    try {
      return await attempt(t);
    } catch (e) {
      deps.log('[board] push failed', e);
      return 'failed';
    }
  }

  async function push(t: PushTrigger): Promise<PushOutcome> {
    if (stopped) return 'stopped';
    if (inFlight) {
      if (!waitsForThrottle(t)) again = true;
      return 'busy';
    }
    inFlight = true;
    let result: PushOutcome;
    try {
      result = await guarded(t);
      while (again && !stopped) {
        again = false;
        await guarded('workout');
      }
    } finally {
      inFlight = false;
      again = false;
    }
    return result;
  }

  return { push, stopped: () => stopped };
}
