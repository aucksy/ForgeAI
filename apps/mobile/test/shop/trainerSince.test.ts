/**
 * R-551 (owner, 14 Nov 2026: "since joining"): the phone shares only workouts on or after the day the member
 * joined THIS gym, never an earlier gym's, and the 12-month cap (0084) still holds. Where the day comes from: the
 * day this phone joined the gym in the app (kept since R-86, 23 Oct 2026); a phone that joined before that kept no
 * day, so the first day it shares is kept and nothing older ever goes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => void mem.set(k, v),
    removeItem: async (k: string) => void mem.delete(k),
  },
}));
// The gym's server is never asked here.
vi.mock('@/shop/gymApi', () => ({ apiAutoReminders: async () => ({ ok: false, missing: true }), apiMembership: async () => ({ ok: false, missing: true }) }));

import { addDays, toISO } from '@/lib/date';
import { GYM_REMINDERS_JOINED_KEY, GYM_REMINDER_STORAGE_KEYS, GYM_SHARE_SINCE_KEY, appJoinedOn, noteAppJoin, shareFirstSeenOn } from '@/shop/gymReminders';
import { ONE_YEAR, THREE_MONTHS, cutToLimits, recentFrom, sharingSinceDay, threeMonthsOf, trainerRecentFrom, type RecentSetRow } from '@/shop/trainerRecent';

const TODAY = '2026-11-14';

const row = (workoutId: string, dateISO: string, name = 'Bench press', weightKg = 60, reps = 8): RecentSetRow => ({
  workoutId,
  dateISO,
  startedAt: 0,
  exerciseId: name,
  name,
  weightKg,
  reps,
});

describe('only workouts since joining this gym', () => {
  it('a workout before the join day is never sent; the join day itself is', () => {
    const joined = '2026-09-01';
    const rows = [row('earlier-gym', '2026-08-31', 'Squat', 100, 5), row('join-day', joined), row('later', '2026-11-10')];
    const out = trainerRecentFrom(rows, new Map(), TODAY, ONE_YEAR, joined);
    expect(out.map((w) => w.d)).toEqual(['2026-11-10', joined]);
    expect(JSON.stringify(out)).not.toMatch(/Squat/);
    // The 3-month way (a server without 0084) keeps the same rule.
    expect(threeMonthsOf(trainerRecentFrom(rows, new Map(), TODAY, ONE_YEAR), TODAY, joined).map((w) => w.d)).toEqual(['2026-11-10', joined]);
    expect(trainerRecentFrom(rows, new Map(), TODAY, THREE_MONTHS, joined).map((w) => w.d)).toEqual(['2026-11-10', joined]);
  });

  it('the 12-month cap still holds when the member joined long ago', () => {
    const joined = '2024-01-01';
    expect(recentFrom(TODAY, ONE_YEAR, joined)).toBe(recentFrom(TODAY, ONE_YEAR));
    expect(recentFrom(TODAY, ONE_YEAR, joined)).toBe('2025-11-14');
    const rows = [row('too-old', addDays(TODAY, -400)), row('in-year', addDays(TODAY, -300)), row('new', TODAY)];
    expect(trainerRecentFrom(rows, new Map(), TODAY, ONE_YEAR, joined).map((w) => w.d)).toEqual([TODAY, addDays(TODAY, -300)]);
    // 400 workouts at most, still.
    const many: RecentSetRow[] = [];
    for (let i = 0; i < 450; i++) many.push(row(`w${i}`, addDays(TODAY, -Math.floor(i / 2))));
    expect(trainerRecentFrom(many, new Map(), TODAY, ONE_YEAR, joined)).toHaveLength(400);
  });

  it('a later join day wins over the cap; a bad or missing day changes nothing', () => {
    expect(recentFrom(TODAY, ONE_YEAR, '2026-10-01')).toBe('2026-10-01');
    expect(recentFrom(TODAY, ONE_YEAR, null)).toBe('2025-11-14');
    expect(recentFrom(TODAY, ONE_YEAR, 'soon')).toBe('2025-11-14');
    const list = [{ d: '2026-11-01', n: 'A', x: [] }, { d: '2026-09-30', n: 'B', x: [] }];
    expect(cutToLimits(list, TODAY, ONE_YEAR, '2026-10-01').map((w) => w.n)).toEqual(['A']);
  });

  it('which day: the join day kept, else the first day it shared; never after today', () => {
    expect(sharingSinceDay('2026-10-20', '2026-11-14', TODAY)).toBe('2026-10-20');
    expect(sharingSinceDay(null, '2026-11-02', TODAY)).toBe('2026-11-02');
    expect(sharingSinceDay('2026-12-01', TODAY, TODAY)).toBe(TODAY);
    expect(sharingSinceDay('junk', 'junk', TODAY)).toBe(TODAY);
  });
});

describe('where the join day is kept', () => {
  beforeEach(() => mem.clear());

  it('the day this phone joined the gym (R-86 record), for that member only', async () => {
    await noteAppJoin('m-1');
    expect(await appJoinedOn('m-1')).toBe(toISO(new Date()));
    expect(await appJoinedOn('m-2')).toBeNull();
    mem.set(GYM_REMINDERS_JOINED_KEY, JSON.stringify({ memberId: 'm-1', at: new Date(2026, 8, 1, 21, 30).getTime() }));
    expect(await appJoinedOn('m-1')).toBe('2026-09-01');
  });

  it('no join day kept (joined before R-86): the first day it shares is kept, so nothing older ever goes', async () => {
    expect(await shareFirstSeenOn('m-1', '2026-11-14')).toBe('2026-11-14');
    // A later share keeps the first day.
    expect(await shareFirstSeenOn('m-1', '2026-12-20')).toBe('2026-11-14');
    // Another member (left and joined again): their own first day.
    expect(await shareFirstSeenOn('m-2', '2026-12-20')).toBe('2026-12-20');
  });

  it('Leave the gym and Erase all data forget it with the other gym keys', () => {
    expect(GYM_REMINDER_STORAGE_KEYS).toContain(GYM_SHARE_SINCE_KEY);
    expect(GYM_REMINDER_STORAGE_KEYS).toContain(GYM_REMINDERS_JOINED_KEY);
  });
});
