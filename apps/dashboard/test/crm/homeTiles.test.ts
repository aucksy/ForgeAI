import { describe, expect, it } from 'vitest';

import { collectedOn, inTile, isBirthdayToday, tileCounts } from '../../src/crm/logic/homeTiles';
import type { MemberView, Payment } from '../../src/crm/types';

const TODAY = '2026-10-15';

function view(over: Partial<MemberView> & { dob?: string | null } = {}): MemberView {
  const { dob = null, ...rest } = over;
  return {
    member: { id: Math.random().toString(36), dateOfBirth: dob } as MemberView['member'],
    current: null,
    coversUntil: '2026-10-20',
    state: 'expiring',
    daysRemaining: 5,
    outstandingP: 0,
    lastVisitOn: null,
    daysSinceVisit: null,
    ...rest,
  };
}

describe('home tiles', () => {
  it('puts each member in exactly one expiry bucket by days left', () => {
    const vs = [0, 1, 3, 4, 7, 8, 15, 16].map((d) => view({ daysRemaining: d }));
    const c = tileCounts(vs, TODAY);
    expect([c['exp-today'], c['exp-1-3'], c['exp-4-7'], c['exp-8-15']]).toEqual([1, 2, 2, 2]);
  });

  it('a member with no plan covering today is in no expiry bucket', () => {
    const v = view({ coversUntil: null, daysRemaining: -3, state: 'expired' });
    expect(inTile(v, 'exp-today', TODAY)).toBe(false);
    expect(inTile(v, 'expired', TODAY)).toBe(true);
  });

  it('birthdays: same day and month; 29 Feb is wished on 28 Feb in other years', () => {
    expect(isBirthdayToday('1990-10-15', TODAY)).toBe(true);
    expect(isBirthdayToday('1990-10-16', TODAY)).toBe(false);
    expect(isBirthdayToday('2000-02-29', '2027-02-28')).toBe(true);
    expect(isBirthdayToday('2000-02-29', '2028-02-28')).toBe(false);
    expect(isBirthdayToday('2000-02-29', '2028-02-29')).toBe(true);
    expect(isBirthdayToday(null, TODAY)).toBe(false);
  });

  it('came in today, and today\'s collection skips voided receipts', () => {
    expect(inTile(view({ lastVisitOn: TODAY }), 'visited-today', TODAY)).toBe(true);
    const pay = (amountP: number, paidOn: string, voided = false) => ({ amountP, paidOn, voided }) as Payment;
    expect(collectedOn([pay(100000, TODAY), pay(50000, TODAY, true), pay(70000, '2026-10-14')], TODAY)).toBe(100000);
  });
});
