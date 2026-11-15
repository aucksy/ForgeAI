/**
 * R-561 (owner, 15 Nov 2026): the bell panel in three groups, and payment notices that stand out.
 *  - "even the notifications panel has different sections ... These are also not easy to identify because the color is
 *    so muted". The panel's groups, in this order: "Your gym" (what members, the desk and joins did: the gym's alerts,
 *    supabase 0075 owner_alerts), "From MettleUp" (HQ's messages), "What's new" (the admin app's updates). A group with
 *    nothing in it is left out. Each heading shows how many are in it.
 *  - "each payment notification gets its own colour ... so the owner can single them out". A notice about money gets a
 *    tone: paid (green, a tick), to check (amber, a clock: someone said they paid and the bank is not checked yet), or a
 *    problem (red, a warning sign: a payment failed or a fee is overdue), always with the small "Payment" label and
 *    the tone in words for a screen reader, so the colour is never the only sign.
 *
 * Which alerts are about money today: 'paid_online' (a member paid a fee or the shop online, 0075 hq_paid_alerts). The
 * server writes no other money alert yet; a line that says a payment failed, is overdue, or that someone said they
 * paid is recognised from its words too, so a future server line gets its colour without an admin app change. PURE.
 */
import type { GymAlert, GymAlertKind } from './gymAlerts';

export type PayTone = 'paid' | 'check' | 'problem';

const FAILED = /\b(payment|paid|pay|fee|fees)\b[^.]*\b(failed|did not go through|didn't go through|declined|bounced|was refused)\b|\b(failed|declined)\b[^.]*\bpayment\b/i;
const OVERDUE = /\b(overdue|fee is due|fees are due|is late to pay|not paid yet)\b/i;
const SAID_PAID = /\b(said|says) (they|she|he) (have |has )?paid\b|\bI have paid\b|\bcheck (your|the) bank\b|\bpayment to check\b/i;
const PAID = /\bpaid online\b|\bpayment (was )?received\b/i;

/** Kinds that are always about money (the rest only by their words). */
const MONEY_KINDS: ReadonlySet<GymAlertKind> = new Set<GymAlertKind>(['paid_online']);

/** Is this alert about money, and how is it? null: not about money. PURE. */
export function paymentTone(a: Pick<GymAlert, 'kind' | 'line'>): PayTone | null {
  const line = a.line;
  if (FAILED.test(line) || OVERDUE.test(line)) return 'problem';
  if (SAID_PAID.test(line)) return 'check';
  if (MONEY_KINDS.has(a.kind) || PAID.test(line)) return 'paid';
  return null;
}

/** The words: the label on every money notice, and the tone in words (said to a screen reader after the label). */
export const PAY_WORDS = {
  label: 'Payment',
  paid: 'Paid',
  check: 'Check this payment',
  problem: 'Payment problem',
} as const;

export type BellGroupId = 'gym' | 'mettleup' | 'news';

/** The headings, in panel order (English; drawn through t()). */
export const BELL_GROUPS: readonly { id: BellGroupId; title: string }[] = [
  { id: 'gym', title: 'Your gym' },
  { id: 'mettleup', title: 'From MettleUp' },
  { id: 'news', title: "What's new" },
];

/** How many of the gym's alerts the bell lists (the newest; the rest are on Today and their pages). */
export const BELL_ALERTS = 8;

/**
 * The groups to draw, with their counts, in order; an empty group is left out. `news`: the changes in the newest
 * update (0 when there is none). PURE.
 */
export function bellGroups(counts: { gym: number; mettleup: number; news: number }): { id: BellGroupId; title: string; count: number }[] {
  return BELL_GROUPS.map((g) => ({ ...g, count: counts[g.id] })).filter((g) => g.count > 0);
}

// ---------------------------------------------------------------- which alerts are new to the bell

export const BELL_SEEN_KEY = 'forgeai.bell.alertsSeen.v1';

/** A browser that never opened the bell counts the alerts of the last day as new. */
export const FIRST_LOOK_MS = 24 * 60 * 60 * 1000;

interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** The newest alert time this browser saw in the bell; null when it never opened it (or cannot keep it). */
export function readBellSeen(store: Store | null): number | null {
  if (!store) return null;
  try {
    const v = Number(store.getItem(BELL_SEEN_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch (e) {
    console.warn('[bell] seen time unreadable', e);
    return null;
  }
}

export function saveBellSeen(store: Store | null, at: number): void {
  if (!store || !(at > 0)) return;
  try {
    store.setItem(BELL_SEEN_KEY, String(at));
  } catch (e) {
    console.warn('[bell] could not keep the seen time', e);
  }
}

/** The alerts the bell's number counts: newer than the last look (or of the last day, before any look). PURE. */
export function unseenAlerts<T extends Pick<GymAlert, 'at'>>(list: readonly T[], seen: number | null, now: number): T[] {
  const after = seen ?? now - FIRST_LOOK_MS;
  return list.filter((a) => a.at > after);
}
