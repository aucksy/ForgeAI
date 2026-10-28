/**
 * How busy the gym is (R-163): asked from the gym when the Gym tab opens, at most every 5 minutes (a
 * pull to refresh asks at once). Kept in memory only: a busy level from yesterday is worth nothing
 * offline, so nothing is saved on the phone. Never throws.
 *
 * A server without 0039 (not live yet): one log line, then the card stays hidden and the app stops
 * asking until it restarts. Offline or a slow signal: the last answer stays for 30 minutes, then the card hides; no log line.
 */
import { apiGymBusy } from './gymApi';
import type { GymBusy } from './gymBusy';
import type { GymLink } from './types';

export const GYM_BUSY_EVERY_MS = 5 * 60 * 1000;
/** An answer older than this is not "right now" any more: offline, the card hides (0.60.0 review). */
export const GYM_BUSY_STALE_MS = 30 * 60 * 1000;

/** busy: show it. hidden: no card (no 0039, or too few check-ins yet). keep: nothing new, keep what shows. */
export type BusyRead = { kind: 'busy'; busy: GymBusy } | { kind: 'hidden' } | { kind: 'keep' };

let missing = false;
let kept: { key: string; at: number; busy: GymBusy | null } | null = null;

/** The last answer for this gym link, from memory (null: none, or the gym is still learning). */
export function peekGymBusy(link: GymLink | null, now = Date.now()): GymBusy | null {
  return link && kept?.key === link.memberKey && now - kept.at < GYM_BUSY_STALE_MS ? kept.busy : null;
}

export async function readGymBusy(link: GymLink, opts: { force?: boolean; now?: number } = {}): Promise<BusyRead> {
  if (missing) return { kind: 'hidden' };
  const now = opts.now ?? Date.now();
  if (!opts.force && kept?.key === link.memberKey && now - kept.at < GYM_BUSY_EVERY_MS) {
    return kept.busy ? { kind: 'busy', busy: kept.busy } : { kind: 'hidden' };
  }
  try {
    const r = await apiGymBusy(link.memberKey);
    if (r.ok) {
      kept = { key: link.memberKey, at: now, busy: r.data };
      return r.data ? { kind: 'busy', busy: r.data } : { kind: 'hidden' };
    }
    if ('missing' in r) {
      missing = true;
      kept = null;
      console.log('[busy] the gym server has no busy times yet (0039 not live)');
      return { kind: 'hidden' };
    }
    if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[busy] could not read how busy the gym is', r.error.kind);
    return keepOrHide(link, now);
  } catch (e) {
    console.warn('[busy] reading how busy the gym is failed', e);
    return keepOrHide(link, now);
  }
}

/** No new answer: keep what shows while it is still recent, else hide the card. */
function keepOrHide(link: GymLink, now: number): BusyRead {
  return kept?.key === link.memberKey && now - kept.at < GYM_BUSY_STALE_MS ? { kind: 'keep' } : { kind: 'hidden' };
}

/** Tests only. */
export function resetGymBusyForTests(): void {
  missing = false;
  kept = null;
}
