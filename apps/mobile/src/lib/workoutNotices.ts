/**
 * Release A, A12 (docs/ux/MEMBER-APP-MAP.md §3.2): the Workout tab shows at most ONE notice card above
 * Up next, and Up next itself at most ONE extra line. Before, up to 6 cards could stack above Up next
 * and push Start below the fold on a large-text phone.
 *
 *  - Notices, in this order: "That link didn't work" (the answer to the member's own tap, gone after
 *    a few seconds), a new version, What's new, the backup reminder. Once the member has closed one
 *    today (Later, Got it), the others wait for the next day.
 *  - Inside Up next: the easy week, else the easy-week offer, else the muscle tip.
 * The cards still decide for themselves whether they have something to say (`want`); this only
 * decides which one is drawn.
 */
import { getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';

export type NoticeKind = 'link' | 'update' | 'whatsNew' | 'backup';

export const NOTICE_ORDER: readonly NoticeKind[] = ['link', 'update', 'whatsNew', 'backup'];

/**
 * The one notice to draw now, or null. `restDay`: the day a notice was last closed; `undefined` =
 * not read yet (0.56.0 review): then nothing is drawn, so a notice closed earlier today never
 * flashes up for a moment before the saved day arrives. PURE.
 */
export function pickNotice(wants: Partial<Record<NoticeKind, boolean>>, restDay: string | null | undefined, today: string): NoticeKind | null {
  if (restDay === undefined) return null;
  for (const kind of NOTICE_ORDER) {
    if (!wants[kind]) continue;
    // A link the member just tapped is always answered; the rest wait a day after one was closed.
    if (kind !== 'link' && restDay === today) continue;
    return kind;
  }
  return null;
}

export type UpNextExtra = 'easyWeek' | 'easyOffer' | 'muscleTip' | null;

/** The one extra line inside Up next. PURE. */
export function upNextExtra(o: { easyNow: boolean; offerEasy: boolean; tip: boolean }): UpNextExtra {
  if (o.easyNow) return 'easyWeek';
  if (o.offerEasy) return 'easyOffer';
  if (o.tip) return 'muscleTip';
  return null;
}

const REST_KEY = 'notice_rest_day';

/** The day a notice was last closed, or null. Never throws (a failed read shows the notice). */
export async function readNoticeRestDay(): Promise<string | null> {
  try {
    return await getMeta(REST_KEY);
  } catch (e) {
    console.warn('[notices] could not read the rest day', e);
    return null;
  }
}

/** A notice was closed today: the others wait until tomorrow. */
export async function restNoticesToday(today: string): Promise<void> {
  await enqueueWrite(() => setMeta(REST_KEY, today));
}
