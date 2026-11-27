/**
 * R-630 slice A: runs the under-18 delete job (cloud/under18Job.ts) against the server. Kept apart from the pure job
 * so its tests load no native module. Called at "Delete and continue" and on every app open while the job is not done.
 */
import { getMeta, setMeta } from '@/db';
import type { GymLink } from '@/shop/types';

import { getStoredAccount, LAST_USER_KEY, MERGE_PENDING_KEY } from './accountMeta';
import { jobState, newJob, parseJob, stepJob, UNDER18_JOB_KEY, type Under18Job } from './under18Job';

async function saveJob(job: Under18Job): Promise<void> {
  await setMeta(UNDER18_JOB_KEY, JSON.stringify(job));
}

/** The job now, or null when no under-18 delete was ever asked for. */
export async function readUnder18Job(): Promise<Under18Job | null> {
  return parseJob(await getMeta(UNDER18_JOB_KEY));
}

/** Start the job at "Delete and continue" (or keep the one already there), then try it once. */
export async function startUnder18Delete(link: GymLink | null): Promise<ReturnType<typeof jobState>> {
  const had = await readUnder18Job();
  // A phone that remembers whose copy it holds (LAST_USER_KEY) also needs the account delete, even signed out.
  const knowsAccount = (await getStoredAccount()) != null || !!(await getMeta(LAST_USER_KEY));
  const job = had ?? newJob(link != null, knowsAccount);
  await saveJob(job);
  return runUnder18Job(link);
}

/** One try of what is still to do. Never throws. */
export async function runUnder18Job(link: GymLink | null): Promise<ReturnType<typeof jobState>> {
  const job = await readUnder18Job();
  if (!job) return 'deleted';
  const { apiGymUnder18Delete } = await import('@/shop/gymApi');
  const { apiUnder18Delete } = await import('./copyApi');
  const { hasLiveSignIn, signOutAccount } = await import('./account');
  const signedIn = (await getStoredAccount()) != null && (await hasLiveSignIn());
  const next = await stepJob(job, {
    gymDelete: async () => {
      if (!link) return 'done'; // left the gym since: the key is gone, and the leave already ended the sharing
      const r = await apiGymUnder18Delete(link.memberKey);
      if (r.ok) return 'done';
      if ('missing' in r) return 'missing';
      return r.error.kind === 'offline' || r.error.kind === 'timeout' ? 'offline' : 'failed';
    },
    accountDelete: signedIn
      ? async () => {
          const r = await apiUnder18Delete();
          if (r.ok) {
            // Either way this phone stops: the copy is gone, or the staff login is kept but nothing more is sent.
            const { clearCopyTables } = await import('./copyLocal');
            await clearCopyTables();
            await setMeta(LAST_USER_KEY, '');
            await setMeta(MERGE_PENDING_KEY, '');
            await signOutAccount();
            return r.data;
          }
          if (r.failure === 'offline') return 'offline';
          if (r.failure === 'signed-out') return 'signedOut';
          return 'failed';
        }
      : null,
  });
  await saveJob(next);
  return jobState(next);
}
