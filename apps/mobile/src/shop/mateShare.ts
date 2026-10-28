/**
 * When the phone shares its workouts with gym mates (R-164). No native imports: everything comes in
 * as `deps`, so the rules are tested without a phone or a server (mateSync.ts wires the real ones).
 *
 *  - Only a phone that joined a gym.
 *  - Switch ON: after a saved workout and when the switch is flipped on: at once. On app start and on
 *    coming back to the app: at most once every 6 hours (a workout saved since was already sent).
 *    Never with the sample (demo) data.
 *  - Switch OFF: the gym is told to delete everything at once. Until it has heard (no signal), the
 *    "off" is kept on the phone and sent again on the next start or return, with no wait.
 *  - One at a time; a second request while one is out runs right after it.
 *  - A failure is one quiet log line. After a failure the next start/return waits a minute. A server
 *    without 0040 (not live yet) is left alone for the rest of this run, and an "off" needs nothing.
 */
import type { MateShare } from './mateProfile';

export type MateTrigger = 'start' | 'active' | 'workout' | 'setting';
export type MateOutcome = 'sent' | 'cleared' | 'off' | 'throttled' | 'no-gym' | 'demo' | 'stopped' | 'failed' | 'busy';
export type MateSendResult = 'ok' | 'missing' | 'failed';

export const MATE_EVERY_MS = 6 * 60 * 60 * 1000;
export const MATE_RETRY_MS = 60 * 1000;

export interface MateDeps {
  now: () => number;
  memberKey: () => Promise<string | null>;
  isDemo: () => Promise<boolean>;
  /** The member's switch, "Let my gym mates see my workouts". */
  shareOn: () => boolean;
  /** The switch changed and the gym has not heard yet (kept on the phone). */
  pending: () => boolean;
  clearPending: () => void;
  build: () => Promise<MateShare>;
  send: (key: string, share: MateShare) => Promise<MateSendResult>;
  stop: (key: string) => Promise<MateSendResult>;
  log: (message: string, detail?: unknown) => void;
}

/** Does this trigger wait for the 6 hours? PURE. */
export function mateWaits(t: MateTrigger): boolean {
  return t === 'start' || t === 'active';
}

/** May a waiting trigger send now? PURE. */
export function mateDue(now: number, sentAt: number | null, retryAt: number | null, pending: boolean): boolean {
  if (retryAt != null && now < retryAt) return false;
  return pending || sentAt == null || now - sentAt >= MATE_EVERY_MS;
}

export function createMateSharer(deps: MateDeps): { share: (t: MateTrigger) => Promise<MateOutcome>; stopped: () => boolean } {
  let stopped = false;
  let inFlight = false;
  let again = false;
  let sentAt: { key: string; at: number } | null = null;
  let retryAt: { key: string; at: number } | null = null;

  async function attempt(t: MateTrigger): Promise<MateOutcome> {
    const key = await deps.memberKey();
    if (!key) return 'no-gym';
    const on = deps.shareOn();
    const pending = deps.pending();
    const now = deps.now();
    if (mateWaits(t) && !mateDue(now, on ? (sentAt?.key === key ? sentAt.at : null) : null, retryAt?.key === key ? retryAt.at : null, pending)) {
      return on ? 'throttled' : 'off';
    }
    if (!on) {
      if (!pending) return 'off';
      const r = await deps.stop(key);
      if (r === 'failed') {
        retryAt = { key, at: deps.now() + MATE_RETRY_MS };
        return 'failed';
      }
      // 'missing': the server never had sharing, so there is nothing to delete.
      sentAt = null;
      if (!deps.shareOn()) deps.clearPending();
      return 'cleared';
    }
    if (await deps.isDemo()) return 'demo';
    const share = await deps.build();
    const r = await deps.send(key, share);
    if (r === 'missing') {
      stopped = true;
      deps.log('[mates] the gym server cannot hold shared workouts yet; not trying again this time');
      return 'stopped';
    }
    if (r === 'failed') {
      retryAt = { key, at: deps.now() + MATE_RETRY_MS };
      return 'failed';
    }
    sentAt = { key, at: deps.now() };
    if (deps.shareOn()) deps.clearPending();
    return 'sent';
  }

  async function guarded(t: MateTrigger): Promise<MateOutcome> {
    try {
      return await attempt(t);
    } catch (e) {
      deps.log('[mates] share failed', e);
      return 'failed';
    }
  }

  async function share(t: MateTrigger): Promise<MateOutcome> {
    // A stopped run (0040 not live) still lets an "off" through: it is answered 'missing' and cleared.
    if (stopped && deps.shareOn()) return 'stopped';
    if (inFlight) {
      if (!mateWaits(t)) again = true;
      return 'busy';
    }
    inFlight = true;
    let result: MateOutcome;
    try {
      result = await guarded(t);
      while (again) {
        again = false;
        if (stopped && deps.shareOn()) break;
        await guarded('setting');
      }
    } finally {
      inFlight = false;
      again = false;
    }
    return result;
  }

  return { share, stopped: () => stopped };
}
