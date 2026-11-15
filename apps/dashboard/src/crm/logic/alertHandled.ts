/**
 * R-593 (owner, 15 Nov 2026): "this today section is basically showing the new messages that came and what we replied.
 * But I marked those conversations as done. I did it myself as the admin user. So why should I be looking at this
 * history? ... Anything that user has already completed manually themselves doesn't have to be sitting here in the
 * today section unnecessarily."
 *
 * So "Latest from your members" on Today lists only what still needs someone, and the bell's number counts only that.
 * The bell's list keeps the whole history (a handled line there says "Done").
 *
 * The server's alert (0075 owner_alerts) carries no id of the thing it is about, only its kind, its words and its time.
 * Every alert is written in the same database step as the thing itself (a message, a question, a request, an
 * enquiry), so both carry the SAME time: an alert is matched to its thing by kind and time (within MATCH_MS). No
 * database change.
 *
 * What "handled" means, kind by kind (HANDLED_BY; the table is also in docs/CLAUDE-NOTES.md R-593):
 *  - member_question, member_feedback, member_complaint ('message'): the conversation was marked done, or the gym
 *    replied after that member's line (the same rule Member messages uses for "Waiting for a reply"); or nothing at
 *    all waits on Member messages any more (its count is 0).
 *  - trainer_question ('question'): the question was answered (or withdrawn); or no question waits (count 0).
 *  - plan_request ('plan'): approved or said no to. phone_link ('link'): confirmed or refused.
 *  - shop_order ('order'): the desk moved the order on (ready, collected or cancelled), as before.
 *  - friend_referred to Enquiries, online_join, page_question ('enquiry'): the enquiry was made a member or marked
 *    not interested, its next call was moved to a later day (it was called), or a web page chat was marked done.
 *  - paid_online, report_sent, member_joined, ai_credits_low, ai_members_limit, and friend_referred about someone who
 *    is already a member ('info'): nothing to do. Shown on Today until the owner has seen it there once: from the
 *    next visit to Today (or after a reload) it is gone. Tapping it opens its page, which also leaves Today.
 * When the panel cannot tell (the list was not read since the alert came), the line stays: a line that still needs
 * someone is never hidden by a guess. A thing that is no longer on its list at all (deleted, or no longer visible)
 * counts as handled once its list was read after the alert came.
 *
 * Times: an alert and its thing are compared by the server's times (no clock difference). "Read after the alert came"
 * compares two times of THIS browser (when the list was read, when the alert first showed up here), so a phone whose
 * clock is wrong still decides right. PURE.
 */

import type { DateISO } from './dates';
import type { AlertOrder, GymAlert, GymAlertKind } from './gymAlerts';
import { alertShown } from './gymAlerts';
import type { TalkKind, TalkThread } from './memberMessages';

/** An alert and its thing were written in one database step; allow for rounding and slow steps. */
export const MATCH_MS = 2_000;
/** An enquiry comes with the gym's records (every 15 s): one still missing this long after the alert is gone. */
export const ENQUIRY_GONE_MS = 10 * 60_000;

export type HandledHow = 'message' | 'question' | 'plan' | 'link' | 'order' | 'enquiry' | 'info';

/** How each kind is handled. Every kind has a rule (a test checks the list against GYM_ALERT_KINDS). */
export const HANDLED_BY: Readonly<Record<GymAlertKind, HandledHow>> = {
  member_question: 'message',
  member_feedback: 'message',
  member_complaint: 'message',
  trainer_question: 'question',
  plan_request: 'plan',
  phone_link: 'link',
  shop_order: 'order',
  friend_referred: 'enquiry',
  online_join: 'enquiry',
  page_question: 'enquiry',
  paid_online: 'info',
  report_sent: 'info',
  member_joined: 'info',
  ai_credits_low: 'info',
  ai_members_limit: 'info',
};

/** The rule for this alert: a friend who is already a member (0085: their member page) is news, not a call. */
export function handledHow(a: Pick<GymAlert, 'kind' | 'route'>): HandledHow {
  if (a.kind === 'friend_referred' && a.route !== '/enquiries') return 'info';
  return HANDLED_BY[a.kind];
}

/** One Member messages conversation, as much as the rule needs (kept in this browser, so small). */
export interface TalkFact {
  kind: TalkKind;
  /** When each of the member's lines came (server ms). */
  memberAts: number[];
  /** Every member line up to this time is handled: the newest gym reply, or "all" when the conversation is done. */
  handledThrough: number;
}

/** A conversation as the rule needs it. PURE. */
export function talkFact(t: TalkThread): TalkFact {
  const replies = t.messages.filter((m) => m.fromGym).map((m) => m.at);
  return {
    kind: t.kind,
    memberAts: t.messages.filter((m) => !m.fromGym).map((m) => m.at),
    handledThrough: t.done ? Number.MAX_SAFE_INTEGER : replies.length ? Math.max(...replies) : 0,
  };
}

/** A list as last read in this browser (`readAt`: this browser's clock). */
export interface Read<T> {
  rows: readonly T[];
  readAt: number;
}

/** A count the server gives (waiting conversations, open questions), and when this browser read it. */
export interface CountRead {
  n: number;
  readAt: number;
}

export interface QuestionFact {
  askedAt: number;
  open: boolean;
}

export interface RequestFact {
  createdAt: number;
  status: string;
}

/** An enquiry as the rule needs it (types.ts Enquiry has all of these). */
export interface EnquiryFact {
  status: 'open' | 'joined' | 'lost';
  followUpOn: DateISO | null;
  createdAt: number;
  updatedAt: number;
  selfJoin?: { at?: number } | null;
  pageAsk?: { at?: number } | null;
  invitedAgain?: { at?: number } | null;
  pageChat?: { needAt?: number; lastAt?: number; doneAt?: number } | null;
}

export interface AlertFacts {
  /** This browser's clock now. */
  now: number;
  /** The gym's day today. */
  today: DateISO;
  /** When this browser first had this alert (its clock); Infinity when unknown. */
  firstSeen: (id: string) => number;
  talkCount: CountRead | null;
  talk: Read<TalkFact> | null;
  questionCount: CountRead | null;
  questions: Read<QuestionFact> | null;
  plan: Read<RequestFact> | null;
  links: Read<RequestFact> | null;
  /** The shop's orders (the list "Shop today" counts). */
  orders: readonly AlertOrder[];
  /** The gym's enquiries (its records); null when not known. */
  enquiries: readonly EnquiryFact[] | null;
  /** Info alerts already seen on Today in an earlier visit. */
  seenInfo: ReadonlySet<string>;
}

/** 'waiting': still needs someone; 'done': someone handled it; 'seen': news the owner has already seen on Today. */
export type AlertState = 'waiting' | 'done' | 'seen';

const near = (x: number | undefined | null, at: number): boolean => typeof x === 'number' && Math.abs(x - at) <= MATCH_MS;

/** Was this read made after the alert showed up in this browser? */
const after = (readAt: number, a: GymAlert, f: AlertFacts): boolean => readAt >= f.firstSeen(a.id);

const TALK_OF: Partial<Record<GymAlertKind, TalkKind>> = {
  member_question: 'question',
  member_feedback: 'feedback',
  member_complaint: 'complaint',
};

function messageState(a: GymAlert, f: AlertFacts): AlertState {
  if (f.talkCount && f.talkCount.n === 0 && after(f.talkCount.readAt, a, f)) return 'done';
  const kind = TALK_OF[a.kind];
  if (f.talk && kind) {
    for (const t of f.talk.rows) {
      if (t.kind !== kind) continue;
      const line = t.memberAts.find((at) => near(at, a.at));
      if (line !== undefined) return t.handledThrough > line ? 'done' : 'waiting';
    }
    if (after(f.talk.readAt, a, f)) return 'done';
  }
  return 'waiting';
}

function questionState(a: GymAlert, f: AlertFacts): AlertState {
  if (f.questionCount && f.questionCount.n === 0 && after(f.questionCount.readAt, a, f)) return 'done';
  if (f.questions) {
    const q = f.questions.rows.find((x) => near(x.askedAt, a.at));
    if (q) return q.open ? 'waiting' : 'done';
    if (after(f.questions.readAt, a, f)) return 'done';
  }
  return 'waiting';
}

function requestState(a: GymAlert, f: AlertFacts, list: Read<RequestFact> | null): AlertState {
  if (!list) return 'waiting';
  const r = list.rows.find((x) => near(x.createdAt, a.at));
  if (r) return r.status === 'pending' ? 'waiting' : 'done';
  return after(list.readAt, a, f) ? 'done' : 'waiting';
}

/** The enquiry this alert is about: the one stamped in the same database step. */
export function alertEnquiry<E extends EnquiryFact>(a: Pick<GymAlert, 'at'>, list: readonly E[]): E | null {
  return (
    list.find(
      (e) =>
        near(e.createdAt, a.at) ||
        near(e.selfJoin?.at, a.at) ||
        near(e.pageAsk?.at, a.at) ||
        near(e.invitedAgain?.at, a.at) ||
        near(e.pageChat?.needAt, a.at) ||
        near(e.pageChat?.lastAt, a.at) ||
        near(e.updatedAt, a.at),
    ) ?? null
  );
}

function enquiryState(a: GymAlert, f: AlertFacts): AlertState {
  if (!f.enquiries) return 'waiting';
  const e = alertEnquiry(a, f.enquiries);
  if (!e) return f.now - f.firstSeen(a.id) > ENQUIRY_GONE_MS ? 'done' : 'waiting';
  if (e.status !== 'open') return 'done';
  // Called, and the next call booked for a later day (Follow-up date).
  if (e.followUpOn && e.followUpOn > f.today) return 'done';
  // F208: the owner's "Mark as done" on a web page chat, after this alert.
  if (a.kind === 'page_question' && typeof e.pageChat?.doneAt === 'number' && e.pageChat.doneAt >= a.at - MATCH_MS) return 'done';
  return 'waiting';
}

/** Does this alert still need someone? PURE. */
export function alertState(a: GymAlert, f: AlertFacts): AlertState {
  switch (handledHow(a)) {
    case 'message':
      return messageState(a, f);
    case 'question':
      return questionState(a, f);
    case 'plan':
      return requestState(a, f, f.plan);
    case 'link':
      return requestState(a, f, f.links);
    case 'order':
      return alertShown(a, f.orders).done ? 'done' : 'waiting';
    case 'enquiry':
      return enquiryState(a, f);
    case 'info':
      return f.seenInfo.has(a.id) ? 'seen' : 'waiting';
  }
}

/** The alerts that still need someone, newest first (Today's card and the bell's number). PURE. */
export function waitingAlerts(list: readonly GymAlert[], f: AlertFacts): GymAlert[] {
  return list.filter((a) => alertState(a, f) === 'waiting');
}
