/**
 * R-522 (owner, 14 Nov 2026): the add-person pop-up offers Owner, Staff (front desk), Trainer and Other (type the
 * job). Access stays two levels: only Owner is ever an owner (logic/staffJobs.ts).
 */
import { describe, expect, it } from 'vitest';

import { peopleFromRows } from '../../src/crm/auth/signin';
import { HINGLISH } from '../../src/crm/lang/hinglish';
import {
  JOB_CHOICES,
  JOB_MAX,
  JOB_WORDS,
  cleanJob,
  jobHint,
  jobOf,
  jobsToSend,
  keepLocalJob,
  personPill,
  readLocalJobs,
  roleFor,
} from '../../src/crm/logic/staffJobs';

function memoryStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('the four jobs', () => {
  it('are offered in this order with these words', () => {
    expect(JOB_CHOICES).toEqual(['owner', 'staff', 'trainer', 'other']);
    expect(JOB_CHOICES.map((c) => JOB_WORDS[c])).toEqual(['Owner', 'Staff (front desk)', 'Trainer', 'Other']);
  });

  it('only Owner gives owner powers: Trainer and Other get the front desk', () => {
    expect(JOB_CHOICES.map(roleFor)).toEqual(['owner', 'staff', 'staff', 'staff']);
  });

  it('each says what it may do, with branches too', () => {
    for (const c of JOB_CHOICES) for (const b of [false, true]) expect(jobHint(c, b).length).toBeGreaterThan(20);
    expect(jobHint('trainer', false)).toContain('workout progress');
    expect(jobHint('other', false)).toContain('Same access as the front desk');
    expect(jobHint('staff', false)).toContain('Never sees money totals');
  });

  it('every word has its Hinglish', () => {
    expect(Object.values(JOB_WORDS).filter((w) => !(w in HINGLISH))).toEqual([]);
    for (const c of JOB_CHOICES) for (const b of [false, true]) expect(HINGLISH[jobHint(c, b)], jobHint(c, b)).toBeTruthy();
  });
});

describe('the typed job', () => {
  it('is tidied, kept short, and empty means none', () => {
    expect(cleanJob('  Head   cleaner ')).toBe('Head cleaner');
    expect(cleanJob('a'.repeat(60))).toHaveLength(JOB_MAX);
    expect(cleanJob('   ')).toBeNull();
    expect(cleanJob(null)).toBeNull();
    expect(cleanJob('Bad\nname')).toBe('Bad name');
  });
});

describe('the pill on a row', () => {
  it('Owner, else the typed job, else Trainer, else Staff', () => {
    expect(personPill({ role: 'owner', job: 'Manager' }, true)).toEqual({ kind: 'owner', text: 'Owner' });
    expect(personPill({ role: 'staff', job: 'Manager' }, true)).toEqual({ kind: 'job', text: 'Manager' });
    expect(personPill({ role: 'staff', job: null }, true)).toEqual({ kind: 'trainer', text: 'Trainer' });
    expect(personPill({ role: 'staff' }, false)).toEqual({ kind: 'staff', text: 'Staff' });
  });
});

describe('before and after 0079 is live', () => {
  const row = (staffId: string, role: 'owner' | 'staff', job?: string | null) => ({
    staffId, name: staffId, phone: '9829012345', role, me: false, devices: 0, lastSeenAt: null, codeUntil: null, ...(job === undefined ? {} : { job }),
  });

  it('the server list tells: no job key before 0079, a job or null after', () => {
    const [before] = peopleFromRows([row('a', 'staff')]);
    expect(before.job).toBeUndefined();
    const [after, none] = peopleFromRows([row('a', 'staff', ' Manager '), row('b', 'staff', null)]);
    expect(after.job).toBe('Manager');
    expect(none.job).toBeNull();
  });

  it('before 0079 the job kept on this browser shows; after, the server one', () => {
    expect(jobOf({ staffId: 'a' }, { a: 'Cleaner' })).toBe('Cleaner');
    expect(jobOf({ staffId: 'a', job: null }, { a: 'Cleaner' })).toBeNull();
    expect(jobOf({ staffId: 'a', job: 'Manager' }, { a: 'Cleaner' })).toBe('Manager');
  });

  it('nothing is sent before 0079; after, what waited is sent once and the rest forgotten', () => {
    const local = { a: 'Cleaner', b: 'Manager', gone: 'Guard', boss: 'Boss' };
    expect(jobsToSend([row('a', 'staff')], local)).toEqual({ send: [], forget: [] });
    const r = jobsToSend([row('a', 'staff', null), row('b', 'staff', 'Manager'), row('boss', 'owner', null)], local);
    expect(r.send).toEqual([{ staffId: 'a', job: 'Cleaner' }]);
    expect(r.forget.sort()).toEqual(['b', 'boss', 'gone']);
  });

  it('kept per gym on this browser; blocked storage keeps nothing and never throws', () => {
    const store = memoryStore();
    expect(keepLocalJob(store, 'g1', 's1', ' Cleaner ')).toEqual({ s1: 'Cleaner' });
    expect(readLocalJobs(store, 'g1')).toEqual({ s1: 'Cleaner' });
    expect(readLocalJobs(store, 'g2')).toEqual({});
    expect(keepLocalJob(store, 'g1', 's1', null)).toEqual({});
    const broken = { getItem: () => '{not json', setItem: () => { throw new Error('blocked'); } };
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      expect(readLocalJobs(broken, 'g1')).toEqual({});
      expect(keepLocalJob(broken, 'g1', 's1', 'Cleaner')).toEqual({ s1: 'Cleaner' });
      expect(readLocalJobs(null, 'g1')).toEqual({});
    } finally {
      console.warn = warn;
    }
  });
});
