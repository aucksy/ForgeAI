/**
 * R-630 slice A (design note docs/designs/R-630.md sections 3a, 3b, 7): the under-18 delete as a job kept in `meta`,
 * so it survives no internet, a closed app and a missing sign-in, and runs again on the next open.
 *
 * Two parts, each the member's own: `gym` (by the gym member key: trainer summary, leaderboard, pop-up code) and
 * `account` (the signed-in MettleUp account: copy, summary, profile, sign-in). "Deleted" shows only when every part
 * that was needed is confirmed by the server.
 *
 * The plan and the words are PURE (tested in test/cloud/under18Job.test.ts); `runUnder18Job` does the calls.
 */
import type { Under18DeleteState } from './ageRule';

export const UNDER18_JOB_KEY = 'under18_delete_job';

/** 'none' = not needed; 'todo' = still to do; 'done' = the server confirmed; 'staff' = a gym staff login, kept. */
export type JobPart = 'none' | 'todo' | 'done' | 'staff';

export interface Under18Job {
  gym: JobPart;
  account: JobPart;
  /** Why the last try stopped, for the backup line. null = no try yet. */
  last: 'offline' | 'signInNeeded' | 'failed' | null;
}

/** A job from its `meta` value; null when there is none or it is unreadable. PURE. */
export function parseJob(raw: string | null | undefined): Under18Job | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Under18Job> | null;
    const part = (p: unknown): JobPart => (p === 'todo' || p === 'done' || p === 'staff' ? p : 'none');
    if (!v) return null;
    const last = v.last === 'offline' || v.last === 'signInNeeded' || v.last === 'failed' ? v.last : null;
    return { gym: part(v.gym), account: part(v.account), last };
  } catch {
    // quiet: a damaged job is started again by the next under-18 check
    return null;
  }
}

/** The job at "Delete and continue": a part for the gym when the phone is in one, for the account when one is known. PURE. */
export function newJob(inGym: boolean, knowsAccount: boolean): Under18Job {
  return { gym: inGym ? 'todo' : 'none', account: knowsAccount ? 'todo' : 'none', last: null };
}

/** Where the job stands, for the backup line. PURE. */
export function jobState(job: Under18Job): Under18DeleteState | 'staff' {
  if (job.gym !== 'todo' && job.account !== 'todo') return job.account === 'staff' ? 'staff' : 'deleted';
  return job.last ?? 'pending';
}

export interface JobDeps {
  /** The gym delete by member key. 'missing' = the server has not had 0101 yet. */
  gymDelete: () => Promise<'done' | 'offline' | 'missing' | 'failed'>;
  /** The account delete. null = no sign-in on this phone right now. */
  accountDelete: (() => Promise<'deleted' | 'staff' | 'offline' | 'signedOut' | 'failed'>) | null;
}

/** One try of every part still to do. Returns the new job; never throws. */
export async function stepJob(job: Under18Job, deps: JobDeps): Promise<Under18Job> {
  const next: Under18Job = { ...job, last: null };
  let stop: Under18Job['last'] = null;
  const worst = (a: Under18Job['last'], b: Under18Job['last']): Under18Job['last'] => {
    const rank = { failed: 3, signInNeeded: 2, offline: 1 } as const;
    if (!a) return b;
    if (!b) return a;
    return rank[a] >= rank[b] ? a : b;
  };
  if (next.gym === 'todo') {
    try {
      const r = await deps.gymDelete();
      if (r === 'done') next.gym = 'done';
      else stop = worst(stop, r === 'offline' ? 'offline' : 'failed');
    } catch (e) {
      console.warn('[under18] gym delete threw', e);
      stop = worst(stop, 'failed');
    }
  }
  if (next.account === 'todo') {
    if (!deps.accountDelete) stop = worst(stop, 'signInNeeded');
    else {
      try {
        const r = await deps.accountDelete();
        if (r === 'deleted') next.account = 'done';
        else if (r === 'staff') next.account = 'staff';
        else stop = worst(stop, r === 'offline' ? 'offline' : r === 'signedOut' ? 'signInNeeded' : 'failed');
      } catch (e) {
        console.warn('[under18] account delete threw', e);
        stop = worst(stop, 'failed');
      }
    }
  }
  next.last = stop;
  return next;
}

/** The words for the 'staff' state. Needs the owner's yes before release (R-630 HIM question 3). */
export const STAFF_LOGIN_WORDS =
  'This sign-in is also a gym staff login, so MettleUp did not delete it. Nothing more is saved from this phone.';
