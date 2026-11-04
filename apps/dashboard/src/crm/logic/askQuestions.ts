/**
 * R-319 item 1 "Ask a trainer", the gym's side (server: supabase/migrations/0053_ask_trainer_and_progress.sql).
 * PURE: the server's answers read defensively, which questions wait and which are done, the "to whom" line, and
 * the plain words for a refused reply. Every word here is read by the owner or a trainer; the reply itself goes
 * to the member's app (and a pop-up on their phone).
 *
 * Who sees a question is the server's rule (_tq_visible): only the person the member picked; "Any trainer"
 * questions go to the owner and every ticked trainer. The owner does NOT see questions asked to another trainer
 * (owner decision, 4 Nov 2026).
 */

import { dateISOFromEpoch, diffDays, formatDayShort, type DateISO } from './dates';

/** Longest reply (the server's limit). */
export const REPLY_MAX = 1000;

export interface GymQuestion {
  id: string;
  /** The app member. */
  appId: string;
  /** The gym's list id, or null when the app member is not matched to the list yet. */
  memberId: string | null;
  name: string;
  phone: string | null;
  /** Who the member picked, or null for "Any trainer". */
  trainerId: string | null;
  trainerName: string | null;
  /** The picked person is still a trainer (or the owner). When not, everyone who answers sees it. */
  trainerLive: boolean;
  question: string;
  askedAt: number;
  answer: string | null;
  answeredBy: string | null;
  answeredAt: number | null;
  withdrawn: boolean;
  open: boolean;
}

export interface GymQuestions {
  role: 'owner' | 'trainer';
  open: number;
  questions: GymQuestion[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const first = (raw: unknown): unknown => (Array.isArray(raw) ? raw[0] : raw);

/** One question row; null when it is not one. PURE. */
export function gymQuestionFrom(v: unknown): GymQuestion | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 64);
  const appId = str(v.appId, 64);
  const question = str(v.question, 600);
  const askedAt = num(v.askedAt);
  if (!id || !appId || !question || askedAt == null) return null;
  const answer = str(v.answer, REPLY_MAX + 50) || null;
  const trainerId = str(v.trainerId, 64) || null;
  return {
    id,
    appId,
    memberId: str(v.memberId, 64) || null,
    name: str(v.name, 60) || 'A member',
    phone: str(v.phone, 30) || null,
    trainerId,
    trainerName: trainerId ? str(v.trainerName, 60) || null : null,
    trainerLive: trainerId ? v.trainerLive === true : true,
    question,
    askedAt,
    answer,
    answeredBy: answer ? str(v.answeredBy, 80) || null : null,
    answeredAt: answer ? num(v.answeredAt) : null,
    withdrawn: v.withdrawn === true,
    open: v.open === true && !answer && v.withdrawn !== true,
  };
}

/** owner_questions' answer; null when it is not one. PURE. */
export function gymQuestionsFrom(raw: unknown): GymQuestions | null {
  const r = first(raw);
  if (!isObj(r) || r.ok !== true || !Array.isArray(r.questions)) return null;
  const questions: GymQuestion[] = [];
  for (const q of r.questions.slice(0, 200)) {
    const x = gymQuestionFrom(q);
    if (x) questions.push(x);
  }
  questions.sort((a, b) => b.askedAt - a.askedAt);
  const open = num(r.open);
  return { role: r.role === 'trainer' ? 'trainer' : 'owner', open: open != null ? Math.max(0, open) : questions.filter((q) => q.open).length, questions };
}

/** owner_question_count's answer: the waiting questions, or null when it is not one. PURE. */
export function questionCountFrom(raw: unknown): number | null {
  const r = first(raw);
  if (!isObj(r) || r.ok !== true) return null;
  const n = num(r.open);
  return n == null ? null : Math.max(0, Math.floor(n));
}

/** owner_answer_question's answer: the question with its reply; null when it is not one. PURE. */
export function answeredFrom(raw: unknown): GymQuestion | null {
  const r = first(raw);
  return isObj(r) && r.ok === true ? gymQuestionFrom(r.question) : null;
}

/** Waiting ones first (oldest first: they have waited longest), then the rest, newest first. PURE. */
export function splitQuestions(list: readonly GymQuestion[]): { waiting: GymQuestion[]; done: GymQuestion[] } {
  const waiting = list.filter((q) => q.open).sort((a, b) => a.askedAt - b.askedAt);
  const done = list.filter((q) => !q.open).sort((a, b) => b.askedAt - a.askedAt);
  return { waiting, done };
}

/** Every word on the Questions page. New (R-319, 4 Nov 2026): the owner checks them at UAT. */
export const QUESTION_WORDS = {
  title: 'Questions',
  navHint: 'Questions members asked you in the app',
  intro: 'Members ask from the MettleUp app. Your reply shows in their app, with a notification on their phone.',
  waiting: 'Waiting for your reply',
  noneWaiting: 'No questions are waiting.',
  done: 'Answered and closed',
  noneYet: 'No questions yet. Members find "Ask a trainer" on the Gym tab of their app.',
  replyLabel: 'Your reply',
  replyHint: 'Short and clear. The member cannot reply back; they can ask a new question.',
  send: 'Send reply',
  sending: 'Sending…',
  sent: 'Reply sent.',
  anyTrainer: 'To any trainer',
  toYou: 'To you',
  to: (name: string): string => `To ${name}`,
  formerTrainer: (name: string): string => `To ${name} (no longer a trainer)`,
  takenBack: 'The member took this question back.',
  noReply: 'Closed with no reply after 14 days.',
  repliedBy: (name: string | null): string => (name ? `${name} replied` : 'Replied'),
  notReady: 'Questions from members are not switched on for your gym yet.',
  notAllowed: 'Only trainers and the owner can see questions. Ask the owner to tick you as a trainer.',
  loadFailed: 'Could not load the questions. Check the internet and try again.',
  tryAgain: 'Try again',
  openMember: 'Open member',
  counter: (n: number): string => `${n} of ${REPLY_MAX} letters`,
} as const;

/** Who the question was asked to, from where the reader sits. PURE. */
export function toWhomLine(q: Pick<GymQuestion, 'trainerId' | 'trainerName' | 'trainerLive'>, myStaffId: string | null): string {
  if (!q.trainerId) return QUESTION_WORDS.anyTrainer;
  if (myStaffId && q.trainerId === myStaffId) return QUESTION_WORDS.toYou;
  const name = q.trainerName ?? 'a trainer';
  return q.trainerLive ? QUESTION_WORDS.to(name) : QUESTION_WORDS.formerTrainer(name);
}

/** "Today, 5:42 pm" / "Yesterday, …" / "3 Nov, 5:42 pm" in India time (the panel's day). PURE. */
export function whenText(ms: number, today: DateISO): string {
  const ist = new Date(ms + 5.5 * 3600 * 1000);
  const h = ist.getUTCHours();
  const clock = `${h % 12 === 0 ? 12 : h % 12}:${String(ist.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  const day = dateISOFromEpoch(ms);
  const ago = diffDays(day, today);
  if (ago === 0) return `Today, ${clock}`;
  if (ago === 1) return `Yesterday, ${clock}`;
  return `${formatDayShort(day)}, ${clock}`;
}

/** What a closed question with no reply says. PURE. */
export function closedText(q: Pick<GymQuestion, 'answer' | 'withdrawn' | 'open'>): string | null {
  if (q.answer || q.open) return null;
  return q.withdrawn ? QUESTION_WORDS.takenBack : QUESTION_WORDS.noReply;
}

/** Plain words for a refused reply, or null when it is not one of these. PURE. */
export function questionErrorWords(e: unknown): string | null {
  const t = e instanceof Error ? e.message : isObj(e) && typeof e.message === 'string' ? e.message : String(e ?? '');
  if (/\bALREADY_ANSWERED\b/.test(t)) return 'Someone already replied to this question. Refresh to see the reply.';
  if (/\bWITHDRAWN\b/.test(t)) return 'The member took this question back, so it cannot be answered.';
  if (/\bNOT_FOUND\b/.test(t)) return 'This question is no longer here. The member may have left the gym.';
  if (/\bINVALID\b/.test(t)) return `Please type a reply (up to ${REPLY_MAX} letters).`;
  if (/\bTRAINER_ONLY\b/.test(t)) return QUESTION_WORDS.notAllowed;
  if (/\bSUSPENDED\b/.test(t)) return 'Your gym is paused, so replies cannot be sent now.';
  return null;
}
