/**
 * "Member messages" (owner request, 12 Nov 2026; docs/plans/gym-member-messages.md): what members send from
 * "Message your gym" on the Gym tab of their app, and the gym's replies. Server:
 * supabase/migrations/0069_member_messages.sql (NOT live until the owner says yes; the page and its menu item
 * stay hidden until the server has it).
 *
 * PURE: the server's answers read defensively, the type filter, which conversations wait, the names shown, and
 * every word the owner or the desk reads on the page.
 *
 * Who sees what is the server's rule (_talk_visible): the owner sees every message; the front desk and trainers
 * see questions and feedback, never complaints. Feedback sent "without my name" reaches the gym with no name,
 * phone or member id at all (the server leaves them out), so this file has nothing to hide itself.
 */

import { whenText } from './askQuestions';
import type { DateISO } from './dates';

/** Longest reply (the server's limit). */
export const TALK_REPLY_MAX = 1000;
/** Lines in one conversation (the server's limit). */
export const TALK_THREAD_MAX = 50;

export type TalkKind = 'question' | 'feedback' | 'complaint';
export const TALK_KINDS: readonly TalkKind[] = ['question', 'feedback', 'complaint'];

export interface TalkLine {
  id: string;
  fromGym: boolean;
  /** Who at the gym wrote it (gym lines only). */
  who: string | null;
  text: string;
  at: number;
}

export interface TalkThread {
  id: string;
  kind: TalkKind;
  /** Feedback sent without the member's name: name, phone and ids are null. */
  anonymous: boolean;
  appId: string | null;
  /** The gym's list id, when the app member is matched to the list. */
  memberId: string | null;
  name: string | null;
  phone: string | null;
  createdAt: number;
  lastAt: number;
  /** Not done, and the member wrote last. */
  waiting: boolean;
  done: boolean;
  doneAt: number | null;
  doneBy: string | null;
  /** The member opened the gym's newest reply. */
  readByMember: boolean;
  /** Oldest first. */
  messages: TalkLine[];
}

export interface TalkList {
  role: 'owner' | 'staff';
  waiting: number;
  threads: TalkThread[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const first = (raw: unknown): unknown => (Array.isArray(raw) ? raw[0] : raw);

export const isTalkKind = (v: unknown): v is TalkKind => typeof v === 'string' && (TALK_KINDS as readonly string[]).includes(v);

function lineFrom(v: unknown): TalkLine | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 64);
  const text = str(v.text, TALK_REPLY_MAX + 50);
  const at = num(v.at);
  if (!id || !text || at == null) return null;
  const fromGym = v.fromGym === true;
  return { id, fromGym, who: fromGym ? str(v.who, 80) || null : null, text, at };
}

/** One conversation; null when it is not one. PURE. */
export function talkThreadFrom(v: unknown): TalkThread | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 64);
  const createdAt = num(v.createdAt);
  if (!id || !isTalkKind(v.kind) || createdAt == null || !Array.isArray(v.messages)) return null;
  const messages = v.messages
    .slice(0, TALK_THREAD_MAX + 10)
    .map(lineFrom)
    .filter((m): m is TalkLine => m !== null)
    .sort((a, b) => a.at - b.at);
  if (messages.length === 0) return null;
  // Only feedback can come without the name (a server mistake never hides a question's sender).
  const anonymous = v.anonymous === true && v.kind === 'feedback';
  const done = v.done === true;
  const lastFromMember = !messages[messages.length - 1].fromGym;
  return {
    id,
    kind: v.kind,
    anonymous,
    appId: anonymous ? null : str(v.appId, 64) || null,
    memberId: anonymous ? null : str(v.memberId, 64) || null,
    name: anonymous ? null : str(v.name, 60) || null,
    phone: anonymous ? null : str(v.phone, 30) || null,
    createdAt,
    lastAt: num(v.lastAt) ?? messages[messages.length - 1].at,
    waiting: !done && (typeof v.waiting === 'boolean' ? v.waiting : lastFromMember),
    done,
    doneAt: done ? num(v.doneAt) : null,
    doneBy: done ? str(v.doneBy, 80) || null : null,
    readByMember: v.readByMember === true,
    messages,
  };
}

/** owner_talk_list's answer; null when it is not one. Newest first. PURE. */
export function talkListFrom(raw: unknown): TalkList | null {
  const r = first(raw);
  if (!isObj(r) || r.ok !== true || !Array.isArray(r.threads)) return null;
  const threads = r.threads
    .slice(0, 200)
    .map(talkThreadFrom)
    .filter((t): t is TalkThread => t !== null)
    .sort((a, b) => b.lastAt - a.lastAt);
  const waiting = num(r.waiting);
  return {
    role: r.role === 'staff' ? 'staff' : 'owner',
    waiting: waiting != null ? Math.max(0, Math.floor(waiting)) : threads.filter((t) => t.waiting).length,
    threads,
  };
}

/** owner_talk_count's answer: the conversations waiting for a reply; null when it is not one. PURE. */
export function talkCountFrom(raw: unknown): number | null {
  const r = first(raw);
  if (!isObj(r) || r.ok !== true) return null;
  const n = num(r.waiting);
  return n == null ? null : Math.max(0, Math.floor(n));
}

/** owner_talk_reply's and owner_talk_done's answer: the conversation as it is now. PURE. */
export function talkThreadAnswerFrom(raw: unknown): TalkThread | null {
  const r = first(raw);
  return isObj(r) && r.ok === true ? talkThreadFrom(r.thread) : null;
}

// ---------------------------------------------------------------- the page

export type TalkFilter = 'all' | TalkKind;

/** The type buttons on top: the front desk never gets complaints, so no Complaints button for them. PURE. */
export function talkFilters(role: 'owner' | 'staff'): TalkFilter[] {
  return role === 'owner' ? ['all', 'question', 'feedback', 'complaint'] : ['all', 'question', 'feedback'];
}

/**
 * The three parts of the page, after the type filter: waiting for a reply (the longest wait on top), replied
 * (still open, newest first), done (newest first). PURE.
 */
export function splitTalk(list: readonly TalkThread[], filter: TalkFilter): { waiting: TalkThread[]; replied: TalkThread[]; done: TalkThread[] } {
  const shown = filter === 'all' ? list : list.filter((t) => t.kind === filter);
  return {
    waiting: shown.filter((t) => t.waiting).sort((a, b) => a.lastAt - b.lastAt),
    replied: shown.filter((t) => !t.waiting && !t.done).sort((a, b) => b.lastAt - a.lastAt),
    done: shown.filter((t) => t.done).sort((a, b) => b.lastAt - a.lastAt),
  };
}

/** How many of a type wait for a reply. PURE. */
export function waitingOf(list: readonly TalkThread[], filter: TalkFilter): number {
  return list.filter((t) => t.waiting && (filter === 'all' || t.kind === filter)).length;
}

/**
 * The number on a type button: every card that button shows (waiting, replied and done), so "All 3" sits over
 * three cards. A fresh-eyes review (12 Nov 2026) found "All 1" over three cards when it counted only the waiting
 * ones; the waiting count lives in the "Waiting for a reply (n)" heading and the menu badge. PURE.
 */
export function shownOf(list: readonly TalkThread[], filter: TalkFilter): number {
  return list.filter((t) => filter === 'all' || t.kind === filter).length;
}

/** The member's name as the page shows it. PURE. */
export function talkName(t: Pick<TalkThread, 'anonymous' | 'name'>): string {
  if (t.anonymous) return MEMBER_MESSAGE_WORDS.anonName;
  return t.name ?? MEMBER_MESSAGE_WORDS.aMember;
}

/** Who wrote a line, with when. PURE. */
export function talkLineHead(t: Pick<TalkThread, 'anonymous' | 'name'>, m: TalkLine, today: DateISO): string {
  const who = m.fromGym ? MEMBER_MESSAGE_WORDS.gymLine(m.who) : t.anonymous ? MEMBER_MESSAGE_WORDS.theMember : (t.name ?? MEMBER_MESSAGE_WORDS.aMember);
  return `${who} · ${whenText(m.at, today)}`;
}

/** The line under a conversation (done, read, or nothing). PURE. */
export function talkStatusLine(t: TalkThread, today: DateISO): string | null {
  if (t.done) return MEMBER_MESSAGE_WORDS.doneBy(t.doneBy, t.doneAt != null ? whenText(t.doneAt, today) : null);
  if (!t.waiting && t.readByMember) return MEMBER_MESSAGE_WORDS.readByMember;
  if (!t.waiting) return MEMBER_MESSAGE_WORDS.notReadYet;
  return null;
}

/** Every word on the Member messages page. New (12 Nov 2026): member-words; the owner checks them at UAT. */
export const MEMBER_MESSAGE_WORDS = {
  title: 'Member messages',
  navHint: 'Questions, feedback and complaints from members',
  intro: 'Members write to you from "Message your gym" on the Gym tab of their app. Your reply shows in their app, and on their phone if notifications are on.',
  staffNote: 'Complaints go to the owner only, so they are not shown here.',
  keptNote: 'Messages are deleted 180 days after the last one in a conversation, or as soon as the member leaves the gym.',
  filterLabel: 'Show',
  filter: { all: 'All', question: 'Questions', feedback: 'Feedback', complaint: 'Complaints' } as Record<TalkFilter, string>,
  kind: { question: 'Question', feedback: 'Feedback', complaint: 'Complaint' } as Record<TalkKind, string>,
  waiting: 'Waiting for a reply',
  noneWaiting: 'No messages are waiting for a reply.',
  replied: 'Replied',
  done: 'Done',
  noneYet: 'No messages yet. Members find "Message your gym" on the Gym tab of their app.',
  noneOfKind: 'No messages of this type yet.',
  aMember: 'A member',
  theMember: 'The member',
  anonName: 'A member (name hidden)',
  anonNote: 'The member sent this without their name. You can still reply here.',
  gymLine: (who: string | null): string => (who ? `${who} replied` : 'The gym replied'),
  replyLabel: 'Your reply',
  replyHint: 'The member reads it in their app and can write back.',
  counter: (n: number): string => `${n} of ${TALK_REPLY_MAX} letters`,
  send: 'Send reply',
  sending: 'Sending…',
  sent: 'Reply sent.',
  markDone: 'Mark as done',
  reopen: 'Mark as not done',
  doneBy: (who: string | null, when: string | null): string =>
    `Marked as done${who ? ` by ${who}` : ''}${when ? `, ${when}` : ''}. If the member writes again, it moves back to Waiting for a reply.`,
  readByMember: 'The member has read your reply.',
  notReadYet: 'The member has not opened your reply yet.',
  full: 'This conversation is full. The member can send a new message.',
  notReady: 'Member messages are not switched on for your gym yet.',
  needsOnline: 'Member messages need your gym online',
  needsOnlineBody: 'Put your gym online first (Settings → Sign-in & data).',
  loadFailed: 'Could not load the messages. Check the internet and try again.',
  tryAgain: 'Try again',
  refresh: 'Refresh',
} as const;

/** Plain words for a refused reply or "done", or null when it is not one of these. PURE. */
export function talkErrorWords(e: unknown): string | null {
  const t = e instanceof Error ? e.message : isObj(e) && typeof e.message === 'string' ? e.message : String(e ?? '');
  if (/\bNOT_FOUND\b/.test(t)) return 'This message is no longer here, so nothing was sent or changed. The member may have left the gym.';
  if (/\bTHREAD_FULL\b/.test(t)) return MEMBER_MESSAGE_WORDS.full;
  if (/\bINVALID\b/.test(t)) return `Please type a reply (up to ${TALK_REPLY_MAX} letters).`;
  if (/\bSUSPENDED\b/.test(t)) return 'Your gym is paused, so replies cannot be sent now.';
  return null;
}
