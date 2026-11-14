/**
 * R-319 item 8a (owner, 4 Nov 2026): "Needs you" on the gym admin panel. One count of everything that
 * waits for the desk or the owner: members' pause and renew requests (0044), numbers members typed at
 * the poster check-in (0048) and new shop orders. A red badge on Today, a list at the top of Today,
 * the count in the browser tab's title, and a short sound plus a browser notice when something NEW
 * arrives while the panel is open. PURE; the polling and the sound live in ui/NeedsYou.tsx.
 */

/**
 * What can wait. R-506 (14 Nov 2026): 'trainer-question' (members' "Ask a trainer" questions waiting for a reply,
 * 0053 owner_question_count) and 'member-message' ("Message your gym" conversations waiting for a reply, 0069
 * owner_talk_count) are read by ui/NeedsYou.tsx too, so they show here and ring (they never did: TODO 0053).
 */
export type NeedsKind = 'plan-request' | 'phone-link' | 'shop-order' | 'trainer-question' | 'member-message';

export interface NeedsItem {
  kind: NeedsKind;
  id: string;
}

export interface NeedsInput {
  planRequests: readonly string[];
  phoneLinks: readonly string[];
  shopOrders: readonly string[];
  questions?: readonly string[];
  messages?: readonly string[];
}

export interface NeedsLine {
  kind: NeedsKind;
  count: number;
  text: string;
  /** Where the line takes you: a place on Today ('#…' anchor) or a page ('/shop'). */
  to: string;
}

export const NEEDS_WORDS = {
  title: 'Needs you',
  alertsOff: 'Turn on alerts to hear a sound and see a notice when a new request or order comes in while this page is open.',
  alertsButton: 'Turn on alerts',
  alertsOn: 'Alerts are on for this browser.',
  alertsBlocked: 'Alerts are blocked in this browser. Allow notifications for this site in the browser settings to get them.',
  noticeTitle: 'MettleUp: needs you',
} as const;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Every waiting item, one list. PURE. */
export function needsItems(input: NeedsInput): NeedsItem[] {
  return [
    ...input.planRequests.map((id) => ({ kind: 'plan-request' as const, id })),
    ...input.phoneLinks.map((id) => ({ kind: 'phone-link' as const, id })),
    ...input.shopOrders.map((id) => ({ kind: 'shop-order' as const, id })),
    ...(input.questions ?? []).map((id) => ({ kind: 'trainer-question' as const, id })),
    ...(input.messages ?? []).map((id) => ({ kind: 'member-message' as const, id })),
  ];
}

/**
 * Ids for a count the server gives without a list ("3 questions waiting"): 'q:1'..'q:3'. A count that goes up
 * has a new id, so it rings once. PURE.
 */
export function countIds(prefix: string, n: number): string[] {
  const k = Number.isFinite(n) ? Math.max(0, Math.min(Math.floor(n), 500)) : 0;
  return Array.from({ length: k }, (_, i) => `${prefix}:${i + 1}`);
}

/** The lines at the top of Today, only the kinds that have something. PURE. */
export function needsLines(items: readonly NeedsItem[]): NeedsLine[] {
  const count = (k: NeedsKind) => items.filter((i) => i.kind === k).length;
  const lines: NeedsLine[] = [];
  const plan = count('plan-request');
  if (plan) lines.push({ kind: 'plan-request', count: plan, text: `${plural(plan, 'plan request', 'plan requests')} from the app to approve`, to: '#needs-plan-requests' });
  const phone = count('phone-link');
  if (phone) lines.push({ kind: 'phone-link', count: phone, text: `${plural(phone, 'check-in number', 'check-in numbers')} to confirm`, to: '#needs-phone-links' });
  const shop = count('shop-order');
  if (shop) lines.push({ kind: 'shop-order', count: shop, text: `${plural(shop, 'new shop order', 'new shop orders')} to get ready`, to: '/shop' });
  const q = count('trainer-question');
  if (q) lines.push({ kind: 'trainer-question', count: q, text: `${plural(q, 'question for trainers', 'questions for trainers')} to answer`, to: '/questions' });
  const m = count('member-message');
  if (m) lines.push({ kind: 'member-message', count: m, text: `${plural(m, 'member message', 'member messages')} to reply to`, to: '/member-messages' });
  return lines;
}

/** "(3) MettleUp for Gyms"; the plain title at 0; 99+ past 99. PURE. */
export function titleWithCount(base: string, n: number): string {
  if (!Number.isFinite(n) || n <= 0) return base;
  return `(${n > 99 ? '99+' : Math.floor(n)}) ${base}`;
}

const key = (i: NeedsItem) => `${i.kind}:${i.id}`;

/**
 * The items that were not there last time. The first look (`before` null) finds nothing new, so
 * opening the panel never rings for what was already waiting. PURE.
 */
export function newArrivals(before: ReadonlySet<string> | null, now: readonly NeedsItem[]): NeedsItem[] {
  if (before === null) return [];
  return now.filter((i) => !before.has(key(i)));
}

export function itemKeys(items: readonly NeedsItem[]): Set<string> {
  return new Set(items.map(key));
}

/** The notice's one line for what just came in. PURE. */
export function arrivalLine(items: readonly NeedsItem[]): string {
  if (items.length === 0) return '';
  if (items.length > 1) return `${items.length} new things need you. Open Today to see them.`;
  const k = items[0].kind;
  if (k === 'plan-request') return 'A member asked to pause or renew their plan.';
  if (k === 'phone-link') return 'A member typed their number at the check-in poster. Confirm it on Today.';
  if (k === 'shop-order') return 'A new shop order came in.';
  if (k === 'member-message') return 'A member sent your gym a message. Open Member messages to reply.';
  return 'A member asked a trainer a question. Open Questions for trainers to reply.';
}
