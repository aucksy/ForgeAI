/**
 * R-522 (Cloudflare free plan): what "Needs you" reads on each of its one-minute looks (ui/NeedsYou.tsx). It used to
 * read five lists every minute, also with the tab hidden (~7,200 calls a day per open panel). Now, while the tab is
 * in view, it reads the gym's alerts list (0075) every minute, and the other lists only:
 *  - when a new alert says that list changed (a plan request, a check-in number, a question, a message, an order);
 *  - every LISTS_EVERY_MS anyway (another desk may have answered one, which makes no alert);
 *  - every minute, as before, on a server without the alerts list.
 * PURE.
 */

import type { GymAlertKind } from './gymAlerts';

export type NeedsPart = 'plan' | 'links' | 'questions' | 'messages' | 'orders';

/** The lists Needs you reads itself (the shop's orders have their own poll, ShopProvider). */
export const LIST_PARTS: readonly NeedsPart[] = ['plan', 'links', 'questions', 'messages'];

export const NEEDS_POLL_MS = 60_000;
export const LISTS_EVERY_MS = 5 * 60_000;

const PART_OF: Partial<Record<GymAlertKind, NeedsPart>> = {
  plan_request: 'plan',
  phone_link: 'links',
  trainer_question: 'questions',
  member_question: 'messages',
  member_feedback: 'messages',
  member_complaint: 'messages',
  shop_order: 'orders',
};

/** Which lists to read on this look; `full` when it is the every-few-minutes read of them all. PURE. */
export function partsToRead(o: { alertsOn: boolean; sinceFullMs: number; fresh: readonly GymAlertKind[] }): { parts: NeedsPart[]; full: boolean } {
  if (!o.alertsOn || o.sinceFullMs >= LISTS_EVERY_MS) return { parts: [...LIST_PARTS], full: true };
  const parts = new Set<NeedsPart>();
  for (const k of o.fresh) {
    const p = PART_OF[k];
    if (p) parts.add(p);
  }
  return { parts: [...parts], full: false };
}
