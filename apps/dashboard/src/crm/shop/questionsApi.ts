/**
 * R-319 items 1 and 11: the calls to the gym server for members' questions ("Ask a trainer") and a member's live
 * Progress (supabase/migrations/0053_ask_trainer_and_progress.sql). Every call carries the owner, desk or trainer
 * key; the server shows each person only the questions addressed to them (owner decision, 4 Nov 2026) and refuses
 * the front desk without the Trainer tick (TRAINER_ONLY).
 *
 * Until 0053 is on the server, the first call answers PGRST202 ("no such function"): this page then remembers
 * "not here" for the life of the page, and Questions and the Progress card stay hidden with no error (as
 * trainerApi.ts does for 0050). Any other failure is not remembered.
 */

import { isDemoLocked } from '../../lib/demoLock';
import { demoServer } from '../../lib/demoServerSlot';
import { answeredFrom, gymQuestionsFrom, questionCountFrom, type GymQuestion, type GymQuestions } from '../logic/askQuestions';
import { memberProgressFrom, type MemberProgress } from '../logic/memberProgress';
import { isNoSuchFunction } from '../logic/workoutOffer';
import { call } from './api';

let missing = false;
const listeners = new Set<() => void>();

function markMissing(): void {
  if (missing) return;
  missing = true;
  console.info('[questions] this gym server has no "Ask a trainer" yet (0053 not applied); Questions and Progress stay hidden');
  for (const fn of [...listeners]) fn();
}

const refused = (e: unknown): boolean => /\bTRAINER_ONLY\b/.test(e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e));

/** True once the server said it has no 0053 (or in the demo gym). */
export function questionsMissing(): boolean {
  return missing || (isDemoLocked() && !demoServer());
}

export function onQuestionsMissing(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Waiting questions for this key. 'missing': no 0053; 'refused': the desk without the tick. */
export async function getQuestionCount(key: string): Promise<number | 'missing' | 'refused'> {
  if (questionsMissing()) return 'missing';
  try {
    const n = questionCountFrom(await call<unknown>('owner_question_count', { p_key: key }));
    if (n == null) throw new Error('unreadable answer');
    return n;
  } catch (e) {
    if (isNoSuchFunction(e)) {
      markMissing();
      return 'missing';
    }
    if (refused(e)) return 'refused';
    throw e;
  }
}

/** The questions this key may read (last 60 days). 'missing': no 0053; 'refused': the desk without the tick. */
export async function getQuestions(key: string): Promise<GymQuestions | 'missing' | 'refused'> {
  if (questionsMissing()) return 'missing';
  try {
    const r = gymQuestionsFrom(await call<unknown>('owner_questions', { p_key: key }));
    if (!r) throw new Error('unreadable answer');
    return r;
  } catch (e) {
    if (isNoSuchFunction(e)) {
      markMissing();
      return 'missing';
    }
    if (refused(e)) return 'refused';
    throw e;
  }
}

/** Send a reply. Throws ALREADY_ANSWERED / WITHDRAWN / NOT_FOUND / INVALID / SUSPENDED as they came. */
export async function answerQuestion(key: string, id: string, text: string): Promise<GymQuestion> {
  const q = answeredFrom(await call<unknown>('owner_answer_question', { p_key: key, p_id: id, p_answer: text }));
  if (!q) throw new Error('unreadable answer');
  return q;
}

/** One list member's live progress. 'missing': no 0053, or the key may not read progress at all. */
export async function getMemberProgress(key: string, memberId: string): Promise<MemberProgress | 'missing'> {
  if (questionsMissing()) return 'missing';
  try {
    const p = memberProgressFrom(await call<unknown>('owner_member_progress', { p_key: key, p_member: memberId }));
    if (!p) throw new Error('unreadable answer');
    return p;
  } catch (e) {
    if (isNoSuchFunction(e)) {
      markMissing();
      return 'missing';
    }
    if (refused(e)) return 'missing';
    throw e;
  }
}

/** Tests only: back to a fresh page. */
export function resetQuestionsApiForTest(): void {
  missing = false;
  listeners.clear();
}
