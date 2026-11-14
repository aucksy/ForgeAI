/**
 * R-319 item 1 "Ask a trainer" (supabase/migrations/0053_ask_trainer_and_progress.sql). The PURE half:
 *  - the gym's answers read defensively (the trainers to pick from, the member's questions);
 *  - which trainer is picked first (the member's own trainer, else "Any trainer");
 *  - what the Gym tab's row says (waiting, a new reply, or nothing yet);
 *  - every word a member reads (ASK_WORDS, held to the member-words rules by a test).
 * Not a live chat: one question at a time, one reply, kept as a short history. The reply pops up on the phone
 * through the gym's push pipeline (deploy/hq/push.js, kind 'trainer_reply') when "Messages from my gym" is on.
 * trainerSync.ts talks to the server.
 * R-533 (owner, 14 Nov 2026): "ask a trainer may not be accurate because you do let the user ask the gym owner or
 * the trainer". The member now reads "Ask about your workout" (whoever answers: their trainer, any trainer or the
 * owner); the code keeps its old names. Not "Ask your gym": it sits next to "Message your gym" on the Gym tab and the
 * two would read the same. Also R-533: a red count on the row and the Gym tab while a reply is unread
 * (askUnreadCount, askReplySync.ts), and the 15-minute check pops up a reply the push missed (planReplyAlerts).
 * R-505 (owner, 14 Nov 2026): only for members on a running paid gym plan (askAccess below; the server refuses the
 * others with NO_PLAN, supabase/migrations/0074_ask_trainer_paid_plan.sql).
 */
import type { MembershipAnswer } from './membership';

/** Longest question (the server's limit). */
export const ASK_MAX = 500;

export interface AskTrainer {
  id: string;
  /** "Rohit S." */
  name: string;
  /** The gym's owner (members may ask the owner too; only the owner then sees it). */
  owner: boolean;
}

export interface AskChoices {
  /** The member's own trainer (picked by the gym), or null. */
  mine: string | null;
  trainers: AskTrainer[];
  /** A question is waiting for a reply. */
  open: boolean;
}

export interface AskQuestion {
  id: string;
  question: string;
  /** Who it was asked to ("Rohit S."), or null for "Any trainer". */
  trainer: string | null;
  askedAt: number;
  answer: string | null;
  /** First name of who replied. */
  answeredBy: string | null;
  answeredAt: number | null;
  withdrawn: boolean;
  open: boolean;
}

/** Every word a member reads here. New (R-319, 4 Nov 2026): the owner checks them at UAT. */
export const ASK_WORDS = {
  rowTitle: 'Ask about your workout',
  rowSub: 'Your trainer or the gym owner replies here.',
  rowWaiting: 'Your question is waiting for a reply',
  rowReplied: 'Your gym replied to your question. Tap to read it.',
  /** TalkBack, after the row's title: how many replies are unread. */
  rowSpoken: (n: number): string => (n === 1 ? '1 new reply' : `${n} new replies`),
  title: 'Ask about your workout',
  intro: 'Type one question about your workout. Your trainer or the gym owner replies on this page.',
  pushNote: 'Turn on "Messages from my gym" in Settings to get a notification when they reply.',
  toLabel: 'Who should answer?',
  anyTrainer: 'Any trainer or the owner',
  yours: (name: string): string => `${name} (your trainer)`,
  owner: (name: string): string => `${name} (gym owner)`,
  onlyThem: 'Only the person you pick sees your question. "Any trainer or the owner" sends it to every trainer and the gym owner.',
  noTrainers: 'Your gym has not listed its trainers in the app yet, so the gym owner will answer.',
  placeholder: 'For example: How can I squat deeper without pain in my knees?',
  counter: (n: number): string => `${n} of ${ASK_MAX} letters`,
  send: 'Send question',
  sent: 'Sent. The reply will show on this page.',
  waiting: 'Waiting for a reply. You can ask a new question once this one is answered.',
  takeBack: 'Take back my question',
  history: 'Your questions',
  you: 'You asked',
  replied: (name: string | null): string => (name ? `${name} replied` : 'Your gym replied'),
  askedTo: (name: string | null): string => (name ? `To ${name}` : 'To any trainer or the owner'),
  noReply: 'No reply came. You can ask again.',
  takenBack: 'You took this question back.',
  empty: 'You have not asked anything yet.',
  notReady: 'Asking about your workout is not ready at your gym yet. Please check again later.',
  failedOffline: 'Could not send. Check your internet and try again.',
  failedRead: 'Could not load your questions. Check your internet and pull down to try again.',
  errOpen: 'You already have a question waiting. Wait for the reply, or take it back first.',
  errTooMany: 'You have asked 3 questions today. Please ask again tomorrow.',
  errTrainer: 'That trainer is not at your gym any more. Please pick another one.',
  errEmpty: 'Please type your question first.',
  // R-505: a pass member, a member with no plan, or a plan that ended.
  locked: '"Ask about your workout" is for members with a running plan.',
  renew: 'Renew my plan',
  errNoPlan: '"Ask about your workout" is for members with a running plan. Your question was not sent.',
  /** The phone pop-up's line when the 15-minute check finds a reply the push missed (deploy/hq/push.js fcmMessage). */
  popup: (who: string | null, answer: string): string => `${who || 'Your gym'} replied: ${answer}`,
} as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const first = (raw: unknown): unknown => (Array.isArray(raw) ? raw[0] : raw);

/** member_ask_choices' answer; null when it is not one. PURE. */
export function askChoicesFrom(raw: unknown): AskChoices | null {
  const r = first(raw);
  if (!isObj(r) || r.ok !== true) return null;
  const trainers: AskTrainer[] = [];
  for (const t of Array.isArray(r.trainers) ? r.trainers.slice(0, 50) : []) {
    if (!isObj(t)) continue;
    const id = str(t.id, 64);
    const name = str(t.name, 40);
    if (id && name) trainers.push({ id, name, owner: t.owner === true });
  }
  const mine = str(r.mine, 64);
  return { mine: mine && trainers.some((t) => t.id === mine) ? mine : null, trainers, open: r.open === true };
}

function questionFrom(v: unknown): AskQuestion | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 64);
  const question = str(v.question, ASK_MAX + 20);
  const askedAt = num(v.askedAt);
  if (!id || !question || askedAt == null) return null;
  const answer = str(v.answer, 1100) || null;
  // R-533: a reply the gym itself signed comes as "Your" (the first word of "Your gym") until 0086: no name, so the
  // words say "Your gym replied".
  const by = answer ? str(v.answeredBy, 40) || null : null;
  return {
    id,
    question,
    trainer: str(v.trainer, 40) || null,
    askedAt,
    answer,
    answeredBy: by === 'Your' || by === 'Your gym' ? null : by,
    answeredAt: answer ? num(v.answeredAt) : null,
    withdrawn: v.withdrawn === true,
    open: v.open === true && !answer,
  };
}

/** member_questions' answer (newest first); null when it is not one. PURE. */
export function askQuestionsFrom(raw: unknown): AskQuestion[] | null {
  const r = first(raw);
  if (!isObj(r) || r.ok !== true || !Array.isArray(r.questions)) return null;
  const out: AskQuestion[] = [];
  for (const q of r.questions.slice(0, 20)) {
    const x = questionFrom(q);
    if (x) out.push(x);
  }
  return out.sort((a, b) => b.askedAt - a.askedAt);
}

/** member_ask_trainer's answer: the new question; null when it is not one. PURE. */
export function askSentFrom(raw: unknown): AskQuestion | null {
  const r = first(raw);
  return isObj(r) && r.ok === true ? questionFrom(r.question) : null;
}

/** Which trainer is picked when the page opens: the member's own, else "Any trainer" (null). PURE. */
export function defaultPick(c: AskChoices | null): string | null {
  return c?.mine ?? null;
}

/** The server's refusal, in the member's words (anything else: check the internet). PURE. */
export function askErrorWords(message: string | undefined): string {
  const m = (message ?? '').trim();
  if (m === 'OPEN_QUESTION') return ASK_WORDS.errOpen;
  if (m === 'TOO_MANY') return ASK_WORDS.errTooMany;
  if (m === 'NOT_TRAINER') return ASK_WORDS.errTrainer;
  if (m === 'INVALID') return ASK_WORDS.errEmpty;
  if (m === 'NO_PLAN') return ASK_WORDS.errNoPlan;
  return ASK_WORDS.failedOffline;
}

/**
 * R-505: who may ask a trainer, from the gym's own list ("My membership", member_membership: the same answer the
 * server checks before it takes a question).
 *  - open: a plan that covers today (the gym's today, India; a plan ending today still counts);
 *  - locked: the plan ended; the Gym tab row stays, locked, so old questions and replies stay readable.
 *    `renew`: offer "Renew my plan" (not when a renewal is already on record and only starts later);
 *  - hidden: a pass member (FITPASS, cultpass...: they pay the pass company, not the gym), a member with no plan
 *    on the gym's list, or a number the gym's list cannot match: no row at all.
 * `today` (YYYY-MM-DD, India) defaults to the server's own day in the answer. PURE.
 */
export type AskAccess = { kind: 'open' } | { kind: 'locked'; renew: boolean } | { kind: 'hidden' };

export function askAccess(a: MembershipAnswer | null | undefined, today?: string): AskAccess {
  if (!a || !a.ok || a.pass) return { kind: 'hidden' };
  const day = today ?? a.day;
  const cur = a.current;
  if (cur && cur.startsOn <= day && cur.endsOn >= day) return { kind: 'open' };
  // A kept answer read on a later day: its "current" plan may have ended since.
  const endedOn = cur && cur.endsOn < day ? cur.endsOn : a.lastEndedOn;
  if (endedOn) return { kind: 'locked', renew: !a.next };
  return { kind: 'hidden' };
}

/**
 * The one check for "Ask a trainer" on the Gym tab row and on "Message your gym" (R-505): the server has the
 * feature (`choicesKnown`: its choices were read) and the member's access is known and not hidden. null = no
 * row, no mention of it. 'open' = the member may ask now; 'locked' = the row stays, locked. PURE.
 */
export function askShown(choicesKnown: boolean, access: AskAccess | null | undefined): Exclude<AskAccess, { kind: 'hidden' }> | null {
  if (!choicesKnown || !access || access.kind === 'hidden') return null;
  return access;
}

/** The open question, if any (newest first list). PURE. */
export function openQuestion(list: readonly AskQuestion[]): AskQuestion | null {
  return list.find((q) => q.open) ?? null;
}

/**
 * The Gym tab row's second line: a reply the member has not opened yet (newer than `seenUpTo`, ms), a
 * question still waiting, or the plain invitation. PURE.
 */
export function askRowSub(list: readonly AskQuestion[] | null, seenUpTo: number): string {
  if (!list) return ASK_WORDS.rowSub;
  if (askUnreadCount(list, seenUpTo) > 0) return ASK_WORDS.rowReplied;
  if (openQuestion(list)) return ASK_WORDS.rowWaiting;
  return ASK_WORDS.rowSub;
}

/**
 * R-533: how many replies the member has not opened yet (newer than `seenUpTo`, ms: the newest reply the page showed
 * on this phone). The red count on the row and the Gym tab. PURE.
 */
export function askUnreadCount(list: readonly AskQuestion[] | null, seenUpTo: number): number {
  if (!list) return 0;
  return list.filter((q) => q.answer && (q.answeredAt ?? 0) > seenUpTo).length;
}

/** The most reply ids this phone remembers as popped up. */
export const REPLY_ALERTED_CAP = 50;

/**
 * R-533: the 15-minute check's part for replies (the push is the main way; this catches one it missed: no push
 * address, Firebase down). `alerted`: the reply ids this phone already popped up or heard as a push; null = the
 * first look on this phone (remember every reply there is, pop up none: no flood of old ones). A reply pops up
 * when it is not alerted yet, the member has not opened it (newer than `seenUpTo`) and the app is not in front
 * (in front, the row's red count says it). PURE.
 */
export function planReplyAlerts(input: {
  list: readonly AskQuestion[];
  alerted: readonly string[] | null;
  seenUpTo: number;
  inFront: boolean;
}): { alerted: string[]; notify: AskQuestion[] } {
  const answered = input.list.filter((q) => q.answer);
  if (input.alerted === null) return { alerted: answered.map((q) => q.id).slice(0, REPLY_ALERTED_CAP), notify: [] };
  const known = new Set(input.alerted);
  const fresh = answered.filter((q) => !known.has(q.id));
  const notify = input.inFront ? [] : fresh.filter((q) => (q.answeredAt ?? 0) > input.seenUpTo);
  return { alerted: [...input.alerted, ...fresh.map((q) => q.id)].slice(-REPLY_ALERTED_CAP), notify };
}

/** The saved list of popped-up reply ids, for this member only; null when none (a first look). PURE. */
export function replyAlertedFrom(raw: unknown, memberId: string): string[] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as { memberId?: unknown; ids?: unknown };
  if (o.memberId !== memberId || !Array.isArray(o.ids)) return null;
  return o.ids.filter((x): x is string => typeof x === 'string').slice(-REPLY_ALERTED_CAP);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today, 5:42 pm", "Yesterday, 9:05 am", "3 Nov, 5:42 pm" in the phone's own time. PURE (given both instants). */
export function askWhen(ms: number, nowMs: number): string {
  const d = new Date(ms);
  const now = new Date(nowMs);
  const h = d.getHours();
  const clock = `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  const dayKey = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((dayKey(now) - dayKey(d)) / 86400000);
  if (days === 0) return `Today, ${clock}`;
  if (days === 1) return `Yesterday, ${clock}`;
  const year = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}, ${clock}`;
}

/** What a closed question says under it. PURE. */
export function closedLine(q: AskQuestion): string | null {
  if (q.answer) return null;
  if (q.withdrawn) return ASK_WORDS.takenBack;
  if (!q.open) return ASK_WORDS.noReply;
  return null;
}
