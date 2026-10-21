/** Backlog (21 Oct): quick action buttons on Today, picked and ordered by the owner. */
import { describe, expect, it } from 'vitest';

import { DEFAULT_QUICK, MAX_QUICK, QUICK_ACTIONS, moveQuick, normalizeQuick, quickButtons, toggleQuick } from '../../src/crm/logic/quickActions';

describe('quick actions', () => {
  it('nothing saved or junk saved gives the default four; unknown ids and repeats are dropped', () => {
    expect(normalizeQuick(null)).toEqual(DEFAULT_QUICK);
    expect(normalizeQuick('x')).toEqual(DEFAULT_QUICK);
    expect(normalizeQuick(['dues', 'nope', 'dues', 'shop'])).toEqual(['dues', 'shop']);
    expect(normalizeQuick(QUICK_ACTIONS.map((a) => a.id))).toHaveLength(MAX_QUICK);
  });
  it('on, off and order', () => {
    expect(toggleQuick(['dues'], 'shop')).toEqual(['dues', 'shop']);
    expect(toggleQuick(['dues', 'shop'], 'dues')).toEqual(['shop']);
    expect(toggleQuick(['new-member', 'dues', 'check-in', 'shop', 'expense', 'invite'], 'workouts')).toHaveLength(MAX_QUICK);
    expect(moveQuick(['a', 'b', 'c'] as never, 'c' as never, -1)).toEqual(['a', 'c', 'b']);
    expect(moveQuick(['a', 'b'] as never, 'a' as never, -1)).toEqual(['a', 'b']);
  });
  it('a person sees only the buttons for pages they may open', () => {
    const staff = (p: string) => !p.startsWith('/expenses');
    expect(quickButtons(['expense', 'dues'], staff).map((b) => b.id)).toEqual(['dues']);
  });
});
