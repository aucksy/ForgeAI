/**
 * R-630 slice A (No Gaps G3): the under-18 delete job. "Deleted" only after every needed part is confirmed; no
 * internet and no sign-in keep the job; a gym staff login is never deleted and never retried.
 */
import { describe, expect, it } from 'vitest';

import { jobState, newJob, parseJob, stepJob, type JobDeps } from '@/cloud/under18Job';

const deps = (over: Partial<JobDeps> = {}): JobDeps => ({
  gymDelete: async () => 'done',
  accountDelete: async () => 'deleted',
  ...over,
});

describe('newJob and parseJob', () => {
  it('needs only the parts this phone has', () => {
    expect(newJob(true, false)).toEqual({ gym: 'todo', account: 'none', last: null });
    expect(newJob(false, true)).toEqual({ gym: 'none', account: 'todo', last: null });
  });
  it('reads back what it wrote, and a damaged value as nothing', () => {
    const j = { gym: 'done', account: 'todo', last: 'offline' } as const;
    expect(parseJob(JSON.stringify(j))).toEqual(j);
    expect(parseJob('{bad')).toBeNull();
    expect(parseJob('')).toBeNull();
  });
});

describe('stepJob', () => {
  it('both confirmed: Deleted', async () => {
    const j = await stepJob(newJob(true, true), deps());
    expect(j).toEqual({ gym: 'done', account: 'done', last: null });
    expect(jobState(j)).toBe('deleted');
  });

  it('no internet keeps the job and says so; never "deleted"', async () => {
    const j = await stepJob(newJob(true, true), deps({ gymDelete: async () => 'offline', accountDelete: async () => 'offline' }));
    expect(j.gym).toBe('todo');
    expect(j.account).toBe('todo');
    expect(jobState(j)).toBe('offline');
  });

  it('a remembered account with no sign-in asks to sign in once', async () => {
    const j = await stepJob(newJob(false, true), deps({ accountDelete: null }));
    expect(j.account).toBe('todo');
    expect(jobState(j)).toBe('signInNeeded');
  });

  it('half done is not done: the gym part waits while the account is gone', async () => {
    const j = await stepJob(newJob(true, true), deps({ gymDelete: async () => 'missing' }));
    expect(j).toEqual({ gym: 'todo', account: 'done', last: 'failed' });
    expect(jobState(j)).toBe('failed');
  });

  it('a staff login is kept and the job ends without claiming a delete', async () => {
    const j = await stepJob(newJob(false, true), deps({ accountDelete: async () => 'staff' }));
    expect(j.account).toBe('staff');
    expect(jobState(j)).toBe('staff');
  });

  it('a later try finishes only what is left', async () => {
    let gymCalls = 0;
    const first = await stepJob(newJob(true, true), deps({ gymDelete: async () => (gymCalls++, 'done'), accountDelete: async () => 'offline' }));
    const second = await stepJob(first, deps({ gymDelete: async () => (gymCalls++, 'done') }));
    expect(gymCalls).toBe(1);
    expect(jobState(second)).toBe('deleted');
  });

  it('a call that throws is a failure, not a crash', async () => {
    const j = await stepJob(newJob(true, false), deps({ gymDelete: async () => { throw new Error('x'); } }));
    expect(jobState(j)).toBe('failed');
  });
});
