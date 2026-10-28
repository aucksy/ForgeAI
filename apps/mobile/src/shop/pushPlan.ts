/**
 * Gym messages and offers that pop up at once (R-153 step 2, Firebase push): the PURE half.
 *  - planPushToken: whether this phone's push address must be saved with the gym, cleared, or
 *    only forgotten here. pushToken.ts does what it says.
 *  - pushFromData: what a push carried (deploy/hq/push.js fcmMessage), read from whichever shape
 *    the notification library hands over.
 *
 * Rules: the address is saved only while the phone is in a gym, "Messages from my gym" is on and the
 * phone's notifications are allowed; refreshed once a week (the server forgets addresses not
 * refreshed for 60 days). Switch off or notifications off: cleared on the server. Left the gym
 * (or erased): the server already deleted it (member_leave), so it is only forgotten here.
 */

/** What this phone remembers about its saved address. */
export interface SavedPush {
  memberKey: string;
  token: string;
  /** ms since 1970. */
  savedAt: number;
}

export const PUSH_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

export type PushStep =
  | { kind: 'none' }
  | { kind: 'save'; key: string; token: string }
  | { kind: 'clear'; key: string; token: string }
  | { kind: 'forget' };

/** PURE. `linkKey`: the gym link's member key (null: in no gym). `token`: the phone's push address now. */
export function planPushToken(input: {
  linkKey: string | null;
  switchOn: boolean;
  allowed: boolean;
  token: string | null;
  saved: SavedPush | null;
  now: number;
}): PushStep {
  const { linkKey, switchOn, allowed, token, saved, now } = input;
  const wanted = !!linkKey && switchOn && allowed;
  if (wanted) {
    if (!token) return { kind: 'none' };
    const fresh = saved && saved.memberKey === linkKey && saved.token === token && now - saved.savedAt >= 0 && now - saved.savedAt < PUSH_REFRESH_MS;
    return fresh ? { kind: 'none' } : { kind: 'save', key: linkKey, token };
  }
  if (!saved) return { kind: 'none' };
  // Still the same member (switch or notifications off): the gym must forget the address.
  if (linkKey && saved.memberKey === linkKey) return { kind: 'clear', key: saved.memberKey, token: saved.token };
  // Left the gym, or another member now: member_leave already deleted it on the server.
  return { kind: 'forget' };
}

/** What was saved, checked. PURE. */
export function savedPushFrom(raw: unknown): SavedPush | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.memberKey !== 'string' || !r.memberKey) return null;
  if (typeof r.token !== 'string' || !r.token) return null;
  if (typeof r.savedAt !== 'number' || !Number.isFinite(r.savedAt)) return null;
  return { memberKey: r.memberKey, token: r.token, savedAt: r.savedAt };
}

/** What one push said: a message (its id) or an offer, from which gym. */
export interface PushNotice {
  push: 'message' | 'offer';
  noticeId: string;
  gymId: string;
  /** The pop-up's id on the phone (the same one the 15-minute check uses for a message). */
  tag: string;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (typeof v === 'string') {
    try {
      return asRecord(JSON.parse(v) as unknown);
    } catch {
      return null;
    }
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * The push's own fields, wherever they sit: the raw data map (background task), its `body` /
 * `dataString` JSON, or a notification's content.data. Null when it is not one of ours. PURE.
 */
export function pushFromData(raw: unknown): PushNotice | null {
  const seen = new Set<unknown>();
  const queue: unknown[] = [raw];
  while (queue.length > 0) {
    const r = asRecord(queue.shift());
    if (!r || seen.has(r)) continue;
    seen.add(r);
    const push = r.push;
    const id = r.noticeId;
    if ((push === 'message' || push === 'offer') && typeof id === 'string' && /^[0-9a-f-]{8,64}$/i.test(id)) {
      const gymId = typeof r.gymId === 'string' ? r.gymId : '';
      return { push, noticeId: id, gymId, tag: push === 'offer' ? `gym-offer-${id}` : `gym-notice-${id}` };
    }
    for (const k of ['data', 'body', 'dataString', 'content', 'request', 'notification']) {
      if (k in r) queue.push(r[k]);
    }
  }
  return null;
}
