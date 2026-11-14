/**
 * R-506/R-510 (owner, 14 Nov 2026): the gym's alerts, one list of everything a member did that the gym should hear
 * about (supabase/migrations/0075_gym_alerts.sql owner_alerts): a trainer question, a message, feedback or a
 * complaint, a plan request, a check-in number, a shop order, an online payment, a report sent, a member who joined,
 * a friend who asked about joining, someone who asked to join online (R-513, 0077), the gym's AI credits running low (F209, 0078). The server writes each line (the member's first name, what happened, where to
 * go) and shows each person only what they may see. The admin app rings for a new one while it is open (Needs you)
 * and lists the latest on Today. PURE: the polling lives in ui/NeedsYou.tsx.
 */

import { QUESTION_WORDS } from './askQuestions';

/** The trainer questions page, as the menu names it. */
const QUESTIONS_PAGE = QUESTION_WORDS.title;

export type GymAlertKind =
  | 'trainer_question'
  | 'member_question'
  | 'member_feedback'
  | 'member_complaint'
  | 'plan_request'
  | 'phone_link'
  | 'shop_order'
  | 'paid_online'
  | 'report_sent'
  | 'member_joined'
  | 'friend_referred'
  // R-513 (supabase 0077): someone filled the gym's "Become a member" page. Urgent: sent at once.
  | 'online_join'
  // F209 (supabase 0078): the gym's AI credits are down to 10 or fewer (once per top-up), for the owner.
  | 'ai_credits_low'
  // F207 (supabase 0080): a visitor asked a question on the gym's web page; it is an Enquiry.
  | 'page_question';

export const GYM_ALERT_KINDS: readonly GymAlertKind[] = [
  'trainer_question',
  'member_question',
  'member_feedback',
  'member_complaint',
  'plan_request',
  'phone_link',
  'shop_order',
  'paid_online',
  'report_sent',
  'member_joined',
  'friend_referred',
  'online_join',
  'ai_credits_low',
  'page_question',
];

export interface GymAlert {
  id: string;
  kind: GymAlertKind;
  /** The server's own words, e.g. "Asha asked a trainer a question. Open Questions to reply." */
  line: string;
  /** An admin app page: '/questions', '/members/<id>', ... */
  route: string;
  /** Sent at once whatever the digest setting. */
  urgent: boolean;
  /** ms since 1970. */
  at: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const ROUTE = /^\/[A-Za-z0-9/_-]{0,100}$/;

/** owner_alerts' answer, checked: every alert that is one; null when the answer is not one at all. PURE. */
export function gymAlertsFrom(raw: unknown): GymAlert[] | null {
  if (!isObj(raw) || raw.ok !== true || !Array.isArray(raw.alerts)) return null;
  const out: GymAlert[] = [];
  for (const a of raw.alerts) {
    if (!isObj(a)) continue;
    const kind = a.kind as GymAlertKind;
    if (typeof a.id !== 'string' || !GYM_ALERT_KINDS.includes(kind)) continue;
    if (typeof a.line !== 'string' || !a.line.trim()) continue;
    const at = Number(a.at);
    if (!Number.isFinite(at)) continue;
    out.push({ id: a.id, kind, line: a.line.trim(), route: typeof a.route === 'string' && ROUTE.test(a.route) ? a.route : '/', urgent: a.urgent === true, at });
  }
  return out.sort((x, y) => y.at - x.at || x.id.localeCompare(y.id));
}

/**
 * The alerts that were not there last time. The first look (`seen` null) finds nothing new, so opening the panel
 * never rings for what came before. PURE.
 */
export function freshAlerts(seen: ReadonlySet<string> | null, list: readonly GymAlert[]): GymAlert[] {
  if (seen === null) return [];
  return list.filter((a) => !seen.has(a.id));
}

/** The browser notice's words for what just came in. PURE. */
export function alertNotice(fresh: readonly GymAlert[]): { title: string; body: string; route: string } | null {
  if (fresh.length === 0) return null;
  if (fresh.length === 1) {
    const shown = alertShown(fresh[0]);
    return { title: ALERT_WORDS.noticeTitle, body: shown.line, route: shown.route };
  }
  return { title: ALERT_WORDS.noticeTitle, body: `${fresh.length} new updates from your members. Open Today to see them.`, route: '/' };
}

/** "Just now", "12 min ago", "3 h ago", "Yesterday", "2 days ago". PURE. */
export function alertAge(at: number, now: number): string {
  const min = Math.floor((now - at) / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'Yesterday' : `${d} days ago`;
}

/** The latest few for Today: the last 24 hours, newest first. PURE. */
export function latestAlerts(list: readonly GymAlert[], now: number, max = 5): GymAlert[] {
  return list.filter((a) => now - a.at < 24 * 60 * 60 * 1000).slice(0, max);
}

/**
 * Fresh eyes (14 Nov 2026): complaints are the owner's alone (0069; 0075 audience 'owner'). The server already keeps
 * them from the desk and trainers; the admin app checks again, so a desk phone never shows or rings one. PURE.
 */
export function alertsFor(list: readonly GymAlert[], role: 'owner' | 'staff'): GymAlert[] {
  return role === 'owner' ? [...list] : list.filter((a) => a.kind !== 'member_complaint');
}

/** What an order is now, for its line on Today (shop/logic.ts Order: only what is needed). */
export interface AlertOrder {
  orderNo: number;
  status: 'ordered' | 'ready' | 'collected' | 'cancelled';
}

const SHOP_LINE = /^New shop order (\d+) from (.+?)\. Get it ready on Shop\.$/;

/**
 * How Today and the in-tab notice show an alert. The server's words (0075) stay the source; three things are put right
 * here (fresh eyes, 14 Nov 2026):
 *  - the trainer questions page is "Questions for trainers" now (Member messages has its own Questions), so "Open
 *    Questions" says that name;
 *  - a shop order says "#12", and once the desk has moved it on (`orders`: the shop's own list, the one "Shop today"
 *    counts) the line says ready, collected or cancelled instead of "Get it ready", so the two never disagree;
 *  - a member message opens Member messages on its own type (Complaints, Feedback, Questions).
 * `done`: the shop order needs nothing more. PURE.
 */
export function alertShown(a: GymAlert, orders: readonly AlertOrder[] = []): { line: string; route: string; done: boolean } {
  let line = a.line;
  let route = a.route;
  let done = false;
  if (a.kind === 'trainer_question') line = line.replace(/\bOpen Questions\b(?! for trainers)/g, `Open ${QUESTIONS_PAGE}`);
  if (a.kind === 'shop_order') {
    const m = SHOP_LINE.exec(line);
    if (m) {
      const no = Number(m[1]);
      const who = m[2];
      const now = orders.find((o) => o.orderNo === no)?.status ?? 'ordered';
      done = now !== 'ordered';
      line =
        now === 'ready'
          ? `Shop order #${no} from ${who} is ready for pickup.`
          : now === 'collected'
            ? `${who} collected shop order #${no}.`
            : now === 'cancelled'
              ? `Shop order #${no} from ${who} was cancelled.`
              : `New shop order #${no} from ${who}. Get it ready on Shop.`;
    } else {
      line = line.replace(/\bshop order (\d+)\b/, 'shop order #$1');
    }
  }
  if (route === '/member-messages') {
    if (a.kind === 'member_complaint') route = '/member-messages/complaint';
    else if (a.kind === 'member_feedback') route = '/member-messages/feedback';
    else if (a.kind === 'member_question') route = '/member-messages/question';
  }
  return { line, route, done };
}

/** Where a tap on an alert goes: the panel's hash address (what the service worker opens too). PURE. */
export function alertHref(route: string): string {
  return `/#${ROUTE.test(route) ? route : '/'}`;
}

export const ALERT_WORDS = {
  noticeTitle: 'MettleUp: news from your members',
  latest: 'Latest from your members',
} as const;
