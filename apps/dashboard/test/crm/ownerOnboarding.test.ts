/**
 * Owner onboarding, 1 Nov 2026 (after the UAT of the same day):
 *  1. a brand-new gym's Today hides the all-zero tiles until there is anything to count;
 *  2. a screen opened from Get started offers "Next step" to the next step still to do;
 *  3. right after "Create my gym", the gym code and join link are shown once.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { getStartedSteps, nextStepAfter, stepForPath, type StepKey } from '../../src/crm/logic/getStarted';
import { gymHasRecords } from '../../src/crm/logic/homeTiles';
import { NEW_GYM_KEY, forgetNewGym, parseNewGym, peekNewGym, rememberNewGym } from '../../src/crm/logic/newGymReady';

const empty = { members: [], memberships: [], payments: [], visits: [], enquiries: [] };

describe('1. Today on a brand-new gym', () => {
  it('nothing to count: the tiles stay hidden', () => {
    expect(gymHasRecords(empty)).toBe(false);
    // Plans alone do not count: no tile reads them.
    expect(gymHasRecords({ ...empty, plans: [{}] } as never)).toBe(false);
    // An older saved gym with no enquiries list at all.
    expect(gymHasRecords({ members: [], memberships: [], payments: [], visits: [] })).toBe(false);
  });

  it('the first member, sale, payment, visit or enquiry brings them back by themselves', () => {
    for (const k of ['members', 'memberships', 'payments', 'visits', 'enquiries'] as const) {
      expect(gymHasRecords({ ...empty, [k]: [{}] }), k).toBe(true);
    }
  });

  it('an archived member still counts (their dues are still on the tiles)', () => {
    expect(gymHasRecords({ ...empty, members: [{ archived: true }] })).toBe(true);
  });
});

describe('2. Next step from a Get started screen', () => {
  const steps = (ticked: StepKey[] = [], plans = false, members = false) =>
    getStartedSteps({ plans: plans ? [{ active: true } as never] : [], members: members ? [{ archived: false, appUserId: null } as never] : [] }, new Set(ticked));

  it('finds the step a screen belongs to, pages under it too', () => {
    const s = steps();
    expect(stepForPath(s, '/plans')?.key).toBe('plans');
    expect(stepForPath(s, '/members')?.key).toBe('members');
    expect(stepForPath(s, '/members/abc-123')?.key).toBe('members');
    expect(stepForPath(s, '/settings/invite')?.key).toBe('app');
    expect(stepForPath(s, '/attendance/qr')?.key).toBe('poster');
    expect(stepForPath(s, '/settings/branding/')?.key).toBe('brand');
    expect(stepForPath(s, '/money')).toBeNull();
    // Settings itself is not the Branding step.
    expect(stepForPath(s, '/settings')).toBeNull();
    expect(stepForPath(s, '/plansx')).toBeNull();
  });

  it('the next step is the next one still to do, in the list’s order', () => {
    expect(nextStepAfter(steps(), 'plans')?.key).toBe('members');
    // Members already in: from Plans, the next to do is the logo.
    expect(nextStepAfter(steps([], false, true), 'plans')?.key).toBe('brand');
  });

  it('starts again at the top for a step left undone earlier, and never offers the step itself', () => {
    expect(nextStepAfter(steps(['brand', 'staff', 'poster']), 'app')?.key).toBe('plans');
    expect(nextStepAfter(steps(), 'app')?.key).not.toBe('app');
  });

  it('nothing next when every other step is done', () => {
    expect(nextStepAfter(steps(['brand', 'staff', 'poster'], true, true), 'app')).toBeNull();
  });
});

describe('3. The gym code, once, after Create my gym', () => {
  const store = new Map<string, string>();
  const fake = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  afterEach(() => {
    store.clear();
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  });

  it('reads only a whole note, the code in capitals', () => {
    expect(parseNewGym(null)).toBeNull();
    expect(parseNewGym('not json')).toBeNull();
    expect(parseNewGym('{"gymId":"g1"}')).toBeNull();
    expect(parseNewGym('{"gymId":"g1","joinCode":"  "}')).toBeNull();
    expect(parseNewGym('{"gymId":"g1","name":"Iron Temple","joinCode":" iron01 "}')).toEqual({ gymId: 'g1', name: 'Iron Temple', joinCode: 'IRON01' });
  });

  it('left by Create my gym, read on the next screen, then gone: shown once', () => {
    (globalThis as { sessionStorage?: unknown }).sessionStorage = fake;
    rememberNewGym({ gymId: 'g1', name: 'Iron Temple', joinCode: 'IRON01' });
    expect(peekNewGym()?.joinCode).toBe('IRON01');
    forgetNewGym();
    expect(peekNewGym()).toBeNull();
    expect(store.has(NEW_GYM_KEY)).toBe(false);
  });

  it('never throws when this browser blocks storage', () => {
    (globalThis as { sessionStorage?: unknown }).sessionStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => rememberNewGym({ gymId: 'g1', name: '', joinCode: 'X1' })).not.toThrow();
    expect(peekNewGym()).toBeNull();
    expect(() => forgetNewGym()).not.toThrow();
  });
});
