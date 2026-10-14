import { describe, expect, it } from 'vitest';

import {
  collectedOn,
  inTile,
  isBirthdayToday,
  isTileFilter,
  TILE_FILTERS,
  tileCounts,
  tileLabel,
} from '../../src/crm/logic/homeTiles';
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

  it('active members: a live plan (running or ending soon), and the tile number is the list it opens', () => {
    const vs = [
      view({ state: 'active', daysRemaining: 40 }),
      view({ state: 'expiring', daysRemaining: 2 }),
      view({ state: 'expired', coversUntil: null, daysRemaining: -3 }),
      view({ state: 'upcoming', coversUntil: null, daysRemaining: null }),
      view({ state: 'never', coversUntil: null, daysRemaining: null }),
      view({ state: 'cancelled', coversUntil: null, daysRemaining: null }),
    ];
    const list = vs.filter((v) => inTile(v, 'active', TODAY));
    expect(list.map((v) => v.state)).toEqual(['active', 'expiring']);
    expect(tileCounts(vs, TODAY).active).toBe(list.length);
    expect(isTileFilter('active')).toBe(true);
    expect(tileLabel('active')).toBe('Active members');
  });

  it('every tile number equals the length of the list it opens', () => {
    const vs = [
      view({ state: 'active', daysRemaining: 40, lastVisitOn: TODAY }),
      view({ state: 'expiring', daysRemaining: 0, dob: '1990-10-15' }),
      view({ state: 'expiring', daysRemaining: 6 }),
      view({ state: 'expired', coversUntil: null, daysRemaining: -3 }),
    ];
    const counts = tileCounts(vs, TODAY);
    for (const id of TILE_FILTERS) expect(counts[id]).toBe(vs.filter((v) => inTile(v, id, TODAY)).length);
  });

  it('came in today, and today\'s collection skips voided receipts', () => {
    expect(inTile(view({ lastVisitOn: TODAY }), 'visited-today', TODAY)).toBe(true);
    const pay = (amountP: number, paidOn: string, voided = false) => ({ amountP, paidOn, voided }) as Payment;
    expect(collectedOn([pay(100000, TODAY), pay(50000, TODAY, true), pay(70000, '2026-10-14')], TODAY)).toBe(100000);
  });
});
