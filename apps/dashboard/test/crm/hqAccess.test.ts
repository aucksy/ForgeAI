import { describe, expect, it } from 'vitest';

import {
  actionLine,
  grantLine,
  hqAccessFromRow,
  lookedWords,
  notLiveYet,
  openGrant,
  type HqGrant,
} from '../../src/crm/auth/hqAccess';
import { authErrorCode, authErrorWords, SUSPENDED_WORDS } from '../../src/crm/auth/signin';
import { errorWords } from '../../src/crm/shop/logic';

// 23 Oct 2026, 14:05 India time = 08:35 UTC.
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 23, h - 5, m - 30)).toISOString();
};

const grant = (extra: Partial<HqGrant> = {}): HqGrant => ({
  grantId: 'g1',
  openedBy: 'gym',
  openedByName: 'Ravi',
  reasonKind: 'gym_asked',
  reason: 'The gym asked MettleUp support to look',
  startsAt: at('14:05'),
  endsAt: at('15:05'),
  endedEarly: false,
  open: false,
  looked: [],
  ...extra,
});

describe('MettleUp access list (#51)', () => {
  it('reads the server answer field by field and drops anything odd', () => {
    const a = hqAccessFromRow({
      status: 'suspended',
      grants: [{ grantId: 'g1', openedBy: 'hq', startsAt: at('14:05'), endsAt: at('14:20'), open: true, looked: [{ at: at('14:06'), what: 'payment', rows: 12 }] }, { nonsense: true }, 'x'],
      actions: [{ at: at('10:00'), action: 'suspend_gym', reason: 'Unpaid' }, { at: '' }],
    });
    expect(a.status).toBe('suspended');
    expect(a.grants).toHaveLength(1);
    expect(a.grants[0].looked[0]).toEqual({ at: at('14:06'), what: 'payment', rows: 12 });
    expect(a.actions).toHaveLength(1);
    expect(hqAccessFromRow(null)).toEqual({ status: null, grants: [], actions: [], trial: null });
    expect(hqAccessFromRow([])).toEqual({ status: null, grants: [], actions: [], trial: null });
  });

  it('says what MettleUp looked at, when, who opened it and why', () => {
    const g = grant({ looked: [{ at: at('14:07'), what: 'member', rows: 200 }, { at: at('14:35'), what: 'payment', rows: 30 }] });
    expect(grantLine(g)).toBe('MettleUp support viewed your members and receipts on 23 Oct, 14:07-14:35 (you opened it). Reason: you asked MettleUp support to look.');
    const hq = grant({ openedBy: 'hq', reasonKind: 'locked_out', reason: 'Owner lost his phone', looked: [{ at: at('14:10'), what: 'staff', rows: 3 }] });
    expect(grantLine(hq)).toBe('MettleUp support viewed your staff list on 23 Oct, 14:10-14:10 (MettleUp opened it in an emergency). Reason: the owner was locked out: Owner lost his phone.');
    expect(grantLine(grant())).toBe('Support access was open 23 Oct, 14:05-15:05 (you opened it). Nothing was looked at.');
    expect(grantLine(grant({ open: true }))).toBe('Support access is open until 15:05 (you opened it). Nothing looked at yet. Reason: you asked MettleUp support to look.');
    expect(lookedWords([{ at: '', what: 'member', rows: 1 }, { at: '', what: 'plan', rows: 1 }, { at: '', what: 'visit', rows: 1 }])).toBe('members, plans and check-ins');
  });

  it('other MettleUp actions in plain words', () => {
    expect(actionLine({ at: at('10:00'), action: 'suspend_gym', reason: 'Unpaid for 3 months' })).toBe('23 Oct, 10:00: MettleUp paused your gym. Reason: Unpaid for 3 months');
    expect(actionLine({ at: at('10:00'), action: 'something_new', reason: null })).toBe('23 Oct, 10:00: MettleUp made a change to your gym.');
  });

  it('finds the open window; knows a server without the feature', () => {
    expect(openGrant({ status: 'active', grants: [grant(), grant({ grantId: 'g2', open: true })], actions: [], trial: null })?.grantId).toBe('g2');
    expect(openGrant({ status: 'active', grants: [grant()], actions: [], trial: null })).toBeNull();
    expect(notLiveYet({ code: 'PGRST202', message: 'Could not find the function public.owner_hq_access' })).toBe(true);
    expect(notLiveYet(new Error('OWNER_ONLY'))).toBe(false);
  });
});

describe('a paused gym (SUSPENDED, migration 0027)', () => {
  it('says so in plain words on every screen that saves', () => {
    expect(authErrorCode({ message: 'SUSPENDED' })).toBe('SUSPENDED');
    expect(authErrorWords(new Error('SUSPENDED'))).toBe(SUSPENDED_WORDS);
    expect(errorWords({ message: 'SUSPENDED' })).toBe(SUSPENDED_WORDS);
    expect(SUSPENDED_WORDS).toMatch(/download your data/);
  });
});
