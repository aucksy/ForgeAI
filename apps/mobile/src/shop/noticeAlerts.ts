/**
 * Gym notices that pop up on the phone (step 1, no Firebase): the PURE half. Which of the gym's
 * messages are new enough to pop up, and which ids are remembered as "already alerted".
 * noticeAlertsRun.ts reads and writes the phone (storage, notification); noticeTask.ts is the
 * background job that calls it about every 15 minutes.
 *
 * Rules:
 *  - The first look after joining (or after this update) alerts nothing: the old notices are only
 *    remembered, so a member never gets a flood.
 *  - A notice pops up once. Seen ones, ones already alerted and ones older than a week never do.
 *  - From the gym's 3rd message of a day ("quiet", R-195 / 0042) none pops up: it waits in the inbox.
 *  - With the app open in front nothing pops up (the bell shows it), but the notices are still
 *    remembered, so the background job does not pop them later.
 */
import type { InboxMessage } from './inbox';

/** A tap on a pop-up opens the Gym inbox (src/app/shop/inbox.tsx). */
export const NOTICE_ROUTE = '/shop/inbox';
/** Alerted ids kept per member (newest last). */
export const ALERTED_CAP = 200;
/** More new notices than this at once become one pop-up. */
export const MAX_SEPARATE_POPUPS = 3;
/** A notice older than this is not worth a pop-up any more (a phone that was off for weeks). */
export const MAX_ALERT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** What this phone keeps: the member it belongs to and the ids it has alerted (oldest first). */
export interface AlertedState {
  memberId: string;
  ids: string[];
}

export interface NoticePlan {
  /** Notices to pop up now, oldest first. */
  notify: InboxMessage[];
  /** The ids to keep (oldest first, capped). */
  alerted: string[];
}

/** Minutes between background checks (Android's lowest; it may run later, never sooner). */
export const NOTICE_TASK_MINUTES = 15;

/** The background job runs only for a phone in a gym whose member left the switch on. PURE. */
export function noticeTaskWanted(inGym: boolean, switchOn: boolean): boolean {
  return inGym && switchOn;
}

/** What was saved, checked for this member; null = nothing saved for them (a first look). PURE. */
export function alertedFromSaved(raw: unknown, memberId: string): string[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { memberId?: unknown; ids?: unknown };
  if (r.memberId !== memberId || !Array.isArray(r.ids)) return null;
  return r.ids.filter((x): x is string => typeof x === 'string').slice(-ALERTED_CAP);
}

/**
 * PURE. `alerted` is null on the first look for this member.
 * `inFront`: the app is open on screen, so remember but never pop up.
 */
export function planNoticeAlerts(input: { messages: readonly InboxMessage[]; alerted: readonly string[] | null; inFront: boolean; now?: number }): NoticePlan {
  const now = input.now ?? Date.now();
  // Oldest first, so the cap forgets the oldest and pop-ups read in the order they were sent.
  const oldestFirst = [...input.messages].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const known = new Set(input.alerted ?? []);
  const keep = [...(input.alerted ?? [])];
  const notify: InboxMessage[] = [];
  for (const m of oldestFirst) {
    if (known.has(m.id)) continue;
    known.add(m.id);
    keep.push(m.id);
    // A quiet message (0042: the gym's 3rd or later of its day) is only remembered: inbox, no pop-up.
    if (input.alerted === null || input.inFront || m.seen || m.quiet) continue;
    const age = now - Date.parse(m.createdAt);
    if (Number.isFinite(age) && age > MAX_ALERT_AGE_MS) continue;
    notify.push(m);
  }
  return { notify, alerted: keep.slice(-ALERTED_CAP) };
}
