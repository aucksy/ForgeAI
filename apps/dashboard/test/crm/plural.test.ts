import { describe, expect, it } from 'vitest';

import { countOf, recordsLine, unpaidMemberships } from '../../src/crm/logic/plural';

describe('countOf (U-A8: "1 members")', () => {
  it('says one thing in the singular', () => {
    expect(countOf(1, 'member')).toBe('1 member');
    expect(countOf(1, 'check-in')).toBe('1 check-in');
  });

  it('says none and many in the plural', () => {
    expect(countOf(0, 'member')).toBe('0 members');
    expect(countOf(128, 'payment')).toBe('128 payments');
  });

  it('takes an irregular plural', () => {
    expect(countOf(2, 'person', 'people')).toBe('2 people');
    expect(countOf(1, 'person', 'people')).toBe('1 person');
  });
});

// R-449 (R-447 fresh eyes): "0 members · 0 memberships" read as two words for the same thing.
describe('recordsLine (Settings → Sign-in & data, "Your gym’s records")', () => {
  it('says "memberships sold", so it never reads like a second count of members', () => {
    const line = recordsLine({ members: 128, memberships: 140, payments: 300, visits: 2000 });
    expect(line).toBe('128 members · 140 memberships sold (new and renewals) · 300 payments · 2000 check-ins.');
    expect(line).not.toMatch(/ memberships ·/);
  });

  it('a new gym, and one of each', () => {
    expect(recordsLine({ members: 0, memberships: 0, payments: 0, visits: 0 })).toBe(
      '0 members · 0 memberships sold (new and renewals) · 0 payments · 0 check-ins.',
    );
    expect(recordsLine({ members: 1, memberships: 1, payments: 1, visits: 1 })).toBe(
      '1 member · 1 membership sold (new and renewals) · 1 payment · 1 check-in.',
    );
  });
});

// R-450 (R-449 fresh eyes): Money's dues tiles said "N memberships" with no word for what was counted.
describe('unpaidMemberships (Money → Dues tiles and rows)', () => {
  it('says what the number counts', () => {
    expect(unpaidMemberships(0)).toBe('0 memberships not fully paid');
    expect(unpaidMemberships(1)).toBe('1 membership not fully paid');
    expect(unpaidMemberships(3)).toBe('3 memberships not fully paid');
  });
});
