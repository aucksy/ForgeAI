/**
 * R-549 (owner, 14 Nov 2026): "there shouldn't be two separate messaging options there can be one that is message
 * your gym and then the person can select whether they want to send it to the gym owner or ... one of the trainers"
 * (he picked option A). The PURE half of the ONE "Message your gym" row and page that replace the two rows "Ask about
 * your workout" (0053, askTrainer.ts) and "Message your gym" (0069, gymTalk.ts). Both servers stay as they are; the
 * owner panel and the trainer inboxes are unchanged.
 *  - Who it is for, first: "The gym" (0069: Question, Feedback or Complaint) or "A trainer" (0053: one workout
 *    question). "A trainer" shows ONLY to a member who may ask today (R-505: askTrainer.ts askShown(...) 'open').
 *    One side only: no choice, that side opens. Neither: no row.
 *  - Feedback and Complaint ALWAYS go to the gym (sendTarget): a complaint about a trainer never reaches them.
 *  - One list of everything the member sent and every reply, newest first (mergeMessages).
 *  - One red count: the gym's replies plus the trainers' replies (messagesUnread; the Gym tab adds the same two).
 *  - The old addresses stay: /shop/message opens "The gym", /shop/ask (a trainer reply's notification, Settings ->
 *    What my gym can see) opens "A trainer" when the member may ask, else "The gym" (startSide).
 */
import { ASK_WORDS, type AskChoices, type AskQuestion, type AskTrainer } from './askTrainer';
import { TALK_WORDS, type TalkChoices, type TalkKind, type TalkRecipient, type TalkThread, type TalkTo } from './gymTalk';

export type MessageSide = 'gym' | 'trainer';

/** Every new word a member reads on the one row and page (the rest stay in TALK_WORDS and ASK_WORDS). */
export const MSG_WORDS = {
  rowTitle: TALK_WORDS.rowTitle,
  /** The row's second line when both sides are open. */
  rowSubBoth: 'Ask your gym or a trainer, share feedback or make a complaint',
  /** The row's second line when only "A trainer" is open (a gym whose server has no "Message your gym"). */
  rowSubTrainer: 'Ask a trainer about your workout',
  title: TALK_WORDS.title,
  /** The line at the top when both sides are open. */
  introBoth: 'Write to your gym, or ask a trainer about your workout. Every reply shows on this page.',
  toLabel: 'Who is it for?',
  side: { gym: 'The gym', trainer: 'A trainer' } as Record<MessageSide, string>,
  sideHint: {
    // Who reads each type is said under the type (TALK_WORDS.readers; R-552: feedback the owner and front desk only).
    gym: 'Send your gym a question, feedback or a complaint.',
    trainer: 'Ask one question at a time about your workout.',
  } as Record<MessageSide, string>,
  /** Added after the Question hint when "A trainer" is open too. */
  askHint: 'For workout help, pick "A trainer" above.',
  /** The ask card's tag in the one list, so a workout question reads apart from a message to the gym. */
  askTag: 'Workout question',
} as const;

/**
 * Which sides the member may write to now, in the order shown. `gymOn`: the gym's server has "Message your gym"
 * (0069, or a QA build's pretend gym). `trainerOn`: askShown(...)?.kind === 'open' (0053 and a running paid plan).
 * [] = no row. PURE.
 */
export function messageSides(gymOn: boolean, trainerOn: boolean): MessageSide[] {
  const out: MessageSide[] = [];
  if (gymOn) out.push('gym');
  if (trainerOn) out.push('trainer');
  return out;
}

/** The side the page opens on: the one asked for (by the address) when it is open, else the first open one. PURE. */
export function startSide(sides: readonly MessageSide[], wanted: MessageSide | undefined): MessageSide | null {
  if (wanted && sides.includes(wanted)) return wanted;
  return sides[0] ?? null;
}

/** The side an old address opens: /shop/ask (a trainer's reply) -> "A trainer"; anything else -> "The gym". PURE. */
export function sideForRoute(route: string): MessageSide {
  return route.replace(/[?#].*$/, '').replace(/\/+$/, '') === '/shop/ask' ? 'trainer' : 'gym';
}

/**
 * Which server takes a message: a workout question to a trainer goes to 0053 ('ask'); everything else to the gym
 * (0069, 'talk'). Feedback and Complaint ALWAYS go to the gym, whatever side is picked. PURE.
 */
export function sendTarget(side: MessageSide, kind: TalkKind): 'ask' | 'talk' {
  return side === 'trainer' && kind === 'question' ? 'ask' : 'talk';
}

/** The types a side offers: the gym all three; a trainer only a question (never Feedback or Complaint). PURE. */
export function kindsFor(side: MessageSide): readonly TalkKind[] {
  return side === 'trainer' ? ['question'] : ['question', 'feedback', 'complaint'];
}

/**
 * The people under "Who should answer?" on the trainer side: the gym's trainers, without the gym owner (the owner is
 * now "The gym", the first choice). Kept: the owner when the gym made them this member's own trainer. "Any trainer
 * or the owner" stays as it is (every trainer and the owner; owner decision 4 Nov 2026). PURE.
 */
export function trainerChips(c: AskChoices): AskTrainer[] {
  return c.trainers.filter((t) => !t.owner || t.id === c.mine);
}

/** The Question hint: with "A trainer" open too, where workout help goes. PURE. */
export function questionHint(kind: TalkKind, trainerOpen: boolean): string {
  const base = TALK_WORDS.kindHint[kind];
  return kind === 'question' && trainerOpen ? `${base} ${MSG_WORDS.askHint}` : base;
}

/** The line at the top of the page for the open sides. PURE. */
export function messagesIntro(sides: readonly MessageSide[]): string {
  if (sides.length === 2) return MSG_WORDS.introBoth;
  if (sides[0] === 'trainer') return ASK_WORDS.intro;
  return TALK_WORDS.intro;
}

export type MessageItem = { kind: 'talk'; id: string; at: number; thread: TalkThread } | { kind: 'ask'; id: string; at: number; question: AskQuestion };

/** When an item last changed: a thread's newest line; a question's reply, else when it was asked. PURE. */
function askAt(q: AskQuestion): number {
  return Math.max(q.askedAt, q.answeredAt ?? 0);
}

/**
 * The one list: the member's messages to the gym and their workout questions, newest change first. Either half may be
 * missing (null: that server is not there or did not answer). Ties: the gym's thread first, then by id, so the order
 * never jumps between two reads. PURE.
 */
export function mergeMessages(talk: readonly TalkThread[] | null, ask: readonly AskQuestion[] | null): MessageItem[] {
  const items: MessageItem[] = [
    ...(talk ?? []).map((thread): MessageItem => ({ kind: 'talk', id: `talk:${thread.id}`, at: thread.lastAt, thread })),
    ...(ask ?? []).map((question): MessageItem => ({ kind: 'ask', id: `ask:${question.id}`, at: askAt(question), question })),
  ];
  return items.sort((a, b) => b.at - a.at || (a.kind === b.kind ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.kind === 'talk' ? -1 : 1));
}

/** The one red count: the gym's unread replies plus the trainers' unread replies. PURE. */
export function messagesUnread(talkUnread: number, askUnread: number): number {
  return Math.max(0, Math.floor(talkUnread)) + Math.max(0, Math.floor(askUnread));
}

/**
 * The row's second line: a reply not read yet (either side), else a workout question still waiting, else what the
 * open sides offer. PURE.
 */
export function messagesRowSub(sides: readonly MessageSide[], unread: number, askWaiting: boolean): string {
  if (unread > 0) return TALK_WORDS.rowReplied(unread);
  if (askWaiting && sides.includes('trainer')) return ASK_WORDS.rowWaiting;
  if (sides.length === 2) return MSG_WORDS.rowSubBoth;
  if (sides[0] === 'trainer') return MSG_WORDS.rowSubTrainer;
  return TALK_WORDS.rowSub;
}

// ------------------------------------------------------------------ R-586: the member picks who reads it (0096)
/*
 * Owner, 15 Nov 2026 (verbatim): "It should be GYM Onwer or the name of the trainers added in Admin Panel..user can
 * select any. For feedback / complaint, they can select GYM Owner or GYM Admin (gym admin will send to both owner and
 * staff, any type)".
 * Only on a gym server with 0096 (member_talk_choices answers). Then the page has no "The gym" / "A trainer" choice:
 * the member picks the type, then who reads it, and every message goes to 0069's conversations with a recipient:
 *  - Question: "Gym owner" (the owner only) or ONE trainer by name (that trainer, alerted; the owner can read it too,
 *    with no alert). The member's own trainer comes first in the list.
 *  - Feedback and Complaint: "Gym owner" (the owner only) or "Gym admin" (the owner and the front desk, NEVER
 *    trainers: a complaint about a trainer must never reach them).
 * A server without 0096: today's page exactly (the sides above, member_talk_send with no recipient).
 * talkAudience mirrors the server's rule (0096 _talk_visible / _alert_visible) so the words can never promise more.
 */

/** What the member picked: a recipient key ('owner', 'desk', or 'trainer:<staff id>'). */
export type RecipientKey = 'owner' | 'desk' | `trainer:${string}`;

export interface RecipientOption {
  key: RecipientKey;
  to: TalkTo;
  /** The trainer's staff id ('trainer' only). */
  staffId: string | null;
  /** The trainer's name as the gym typed it ('trainer' only). */
  name: string | null;
  /** The gym made this trainer the member's own. */
  mine: boolean;
}

/** Every new word a member reads for R-586. */
export const TO_WORDS = {
  label: 'Who should read it?',
  owner: 'Gym owner',
  desk: 'Gym admin',
  mine: (name: string): string => `${name} (your trainer)`,
  /** The Question hint when the member can pick a trainer (workout help now goes here too). */
  questionHint: 'Ask about timings, fees, your workout and more.',
  /** Under the chips, when the gym has listed no trainers yet. */
  noTrainers: 'Your gym has not added its trainers to the app yet, so only the owner can be picked.',
  /** On each message in the list. */
  toLine: (r: TalkRecipient): string => (r.who === 'owner' ? 'To: Gym owner' : r.who === 'desk' ? 'To: Gym admin' : `To: ${r.name ?? 'a trainer'}`),
} as const;

const NOUN: Record<TalkKind, string> = { question: 'question', feedback: 'feedback', complaint: 'complaint' };

/**
 * Who reads a message and who is alerted, by type and recipient: the server's rule (0069 + 0087 with no recipient;
 * 0096 with one). The owner always reads it. PURE.
 *  - desk: the front desk (people signed in who are not ticked Trainer) reads it;
 *  - trainers: 'all' every trainer, 'one' only the picked trainer, 'none' no trainer;
 *  - alerted: 'readers' everyone who reads it; 'trainer' only the picked trainer (the owner reads it with no alert).
 */
export function talkAudience(kind: TalkKind, to: TalkTo | null): { owner: true; desk: boolean; trainers: 'all' | 'one' | 'none'; alerted: 'readers' | 'trainer' } {
  if (to === 'owner') return { owner: true, desk: false, trainers: 'none', alerted: 'readers' };
  // "Gym admin" is for feedback and complaints; never trainers.
  if (to === 'desk') return { owner: true, desk: kind !== 'question', trainers: 'none', alerted: 'readers' };
  // A trainer gets questions only; anything else goes to the owner (sendRecipient never sends it).
  if (to === 'trainer') return kind === 'question' ? { owner: true, desk: false, trainers: 'one', alerted: 'trainer' } : { owner: true, desk: false, trainers: 'none', alerted: 'readers' };
  // No recipient (an older app): 0069 + 0087.
  if (kind === 'question') return { owner: true, desk: true, trainers: 'all', alerted: 'readers' };
  if (kind === 'feedback') return { owner: true, desk: true, trainers: 'none', alerted: 'readers' };
  return { owner: true, desk: false, trainers: 'none', alerted: 'readers' };
}

/**
 * The chips under "Who should read it?", in order. Question: "Gym owner", then the trainers (the member's own first,
 * then as the server listed them). Feedback and Complaint: "Gym owner" and "Gym admin" only, never a trainer. PURE.
 */
export function recipientOptions(kind: TalkKind, choices: TalkChoices): RecipientOption[] {
  const owner: RecipientOption = { key: 'owner', to: 'owner', staffId: null, name: null, mine: false };
  if (kind !== 'question') return [owner, { key: 'desk', to: 'desk', staffId: null, name: null, mine: false }];
  const trainers = [...choices.trainers].sort((a, b) => Number(b.id === choices.mine) - Number(a.id === choices.mine));
  return [owner, ...trainers.map((t): RecipientOption => ({ key: `trainer:${t.id}`, to: 'trainer', staffId: t.id, name: t.name, mine: t.id === choices.mine }))];
}

/** A chip's words. PURE. */
export function recipientLabel(o: RecipientOption): string {
  if (o.to === 'owner') return TO_WORDS.owner;
  if (o.to === 'desk') return TO_WORDS.desk;
  return o.mine ? TO_WORDS.mine(o.name ?? '') : (o.name ?? '');
}

/**
 * What is sent for the member's pick: the pick when it is one of this type's chips, else "Gym owner" (a pick left over
 * from another type, or a trainer who is no longer listed). So feedback and a complaint can never go to a trainer, and
 * a question never to "Gym admin". PURE.
 */
export function sendRecipient(kind: TalkKind, choices: TalkChoices, picked: RecipientKey): RecipientOption {
  const options = recipientOptions(kind, choices);
  return options.find((o) => o.key === picked) ?? options[0];
}

/** The line under the chips: who reads it, naming the gym ("your gym" when it has no name). PURE. */
export function recipientReaders(kind: TalkKind, o: RecipientOption, gymName: string | null | undefined): string {
  const gym = (gymName ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'your gym';
  const a = talkAudience(kind, o.to);
  const noun = NOUN[kind];
  if (a.trainers === 'one') return `${o.name ?? 'Your trainer'} reads your question and gets a notification. The owner of ${gym} can read it too.`;
  if (a.desk) return `The owner and front desk at ${gym} read your ${noun}. Your trainers do not see it.`;
  return `Only the owner of ${gym} reads your ${noun}. The front desk and trainers do not see it.`;
}
