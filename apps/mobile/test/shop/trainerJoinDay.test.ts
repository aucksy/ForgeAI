/**
 * F218 (0.78.0 review, R-560): phones that joined a gym before 23 Oct 2026 (R-86) kept no join day, so since 0.78.0
 * they shared with the gym's trainers only from the update day on. Now such a phone uses the member's start date on
 * the gym's own list (member_join_day, supabase/migrations/0092_member_join_day.sql, NOT LIVE until the owner's yes).
 *  - the phone's own join day still wins; the gym's day comes next; the first day it shared last;
 *  - never after today, and the 12-month cap still holds (a start date years ago sends at most 12 months);
 *  - without 0092 (or offline, or no day on the gym's list): exactly the 0.78.0 way, a log line, nothing on screen;
 *  - the gym's day is kept on the phone, so a later failed read never shrinks what the trainers see.
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
const api = vi.hoisted(() => ({
  apiMemberJoinDay: vi.fn(),
  apiAutoReminders: async () => ({ ok: false, missing: true }),
  apiMembership: async () => ({ ok: false, missing: true }),
}));
vi.mock('@/shop/gymApi', () => api);
// The phone's workouts are never read here.
vi.mock('@/db', () => ({ getDb: vi.fn() }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));

import { ONE_YEAR, gymJoinDayFrom, recentFrom, sharingSinceDay } from '@/shop/trainerRecent';

const TODAY = '2026-11-15';

async function fresh() {
  vi.resetModules();
  const sync = await import('@/shop/trainerSync');
  const { useGymShop } = await import('@/shop/gymStore');
  const rem = await import('@/shop/gymReminders');
  useGymShop.setState({ link: { memberId: 'm-1', memberKey: 'k-1' } as never });
  return { sync, rem };
}

describe('which day sharing starts from (pure)', () => {
  it("the phone's own join day wins; then the gym's start date; then the first day it shared", () => {
    expect(sharingSinceDay('2026-10-25', '2026-11-15', TODAY, '2025-03-01')).toBe('2026-10-25');
    expect(sharingSinceDay(null, '2026-11-15', TODAY, '2025-03-01')).toBe('2025-03-01');
    expect(sharingSinceDay(null, '2026-11-15', TODAY, null)).toBe('2026-11-15');
    expect(sharingSinceDay(null, '2026-11-15', TODAY, 'junk')).toBe('2026-11-15');
    // Never after today.
    expect(sharingSinceDay(null, TODAY, TODAY, '2026-12-01')).toBe(TODAY);
    // The old three-argument call is unchanged.
    expect(sharingSinceDay(null, '2026-11-02', TODAY)).toBe('2026-11-02');
  });

  it('a start date years ago still sends at most the last 12 months', () => {
    const since = sharingSinceDay(null, TODAY, TODAY, '2023-01-01');
    expect(recentFrom(TODAY, ONE_YEAR, since)).toBe('2025-11-15');
    // A start date inside the year: nothing from before it.
    expect(recentFrom(TODAY, ONE_YEAR, sharingSinceDay(null, TODAY, TODAY, '2026-04-01'))).toBe('2026-04-01');
  });

  it("the server's answer is checked before it is trusted", () => {
    expect(gymJoinDayFrom({ ok: true, joinedOn: '2025-03-01' })).toEqual({ day: '2025-03-01' });
    expect(gymJoinDayFrom([{ ok: true, joinedOn: '2025-03-01' }])).toEqual({ day: '2025-03-01' });
    expect(gymJoinDayFrom({ ok: true, joinedOn: null, why: 'NOT_ON_ROSTER' })).toEqual({ day: null });
    expect(gymJoinDayFrom({ ok: true, joinedOn: '1 Mar 2025' })).toEqual({ day: null });
    expect(gymJoinDayFrom({ ok: false })).toBeNull();
    expect(gymJoinDayFrom(null)).toBeNull();
  });
});

describe('on the phone (trainerSync.sharingSince)', () => {
  beforeEach(() => {
    mem.clear();
    api.apiMemberJoinDay.mockReset();
  });

  it("no join day kept: the gym's start date, asked once and kept", async () => {
    const { sync, rem } = await fresh();
    api.apiMemberJoinDay.mockResolvedValue({ ok: true, data: '2025-03-01' });
    expect(await sync.sharingSince(TODAY)).toBe('2025-03-01');
    expect(api.apiMemberJoinDay).toHaveBeenCalledWith('k-1');
    expect(await rem.keptGymJoinDay('m-1')).toBe('2025-03-01');
    // Offline later: the kept day is used, the server is not asked again.
    api.apiMemberJoinDay.mockResolvedValue({ ok: false, error: { kind: 'offline' } });
    expect(await sync.sharingSince(TODAY)).toBe('2025-03-01');
    expect(api.apiMemberJoinDay).toHaveBeenCalledTimes(1);
  });

  it('the phone kept its own join day: the gym is never asked', async () => {
    const { sync, rem } = await fresh();
    await rem.noteAppJoin('m-1');
    const day = await sync.sharingSince('2099-01-01');
    expect(day).toBe(await rem.appJoinedOn('m-1'));
    expect(api.apiMemberJoinDay).not.toHaveBeenCalled();
  });

  it('0092 not live: exactly the 0.78.0 way (the first day it shared), logged, asked no more this run', async () => {
    const { sync } = await fresh();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    api.apiMemberJoinDay.mockResolvedValue({ ok: false, missing: true });
    expect(await sync.sharingSince(TODAY)).toBe(TODAY);
    expect(await sync.sharingSince('2026-11-20')).toBe(TODAY);
    expect(api.apiMemberJoinDay).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.flat().join(' ')).toMatch(/0092 not live/);
    log.mockRestore();
  });

  it('the gym has no start date: the first day it shared; offline: the same, and asked again next time', async () => {
    const { sync } = await fresh();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    api.apiMemberJoinDay.mockResolvedValueOnce({ ok: false, error: { kind: 'offline' } });
    expect(await sync.sharingSince(TODAY)).toBe(TODAY);
    api.apiMemberJoinDay.mockResolvedValueOnce({ ok: true, data: null });
    expect(await sync.sharingSince('2026-11-16')).toBe(TODAY);
    expect(api.apiMemberJoinDay).toHaveBeenCalledTimes(2);
    // A thrown error never escapes.
    const again = await fresh();
    api.apiMemberJoinDay.mockRejectedValueOnce(new Error('boom'));
    expect(await again.sync.sharingSince(TODAY)).toBe(TODAY);
    warn.mockRestore();
    log.mockRestore();
  });

  it('Leave the gym and Erase all data forget the kept start date with the other gym keys', async () => {
    const { rem } = await fresh();
    expect(rem.GYM_REMINDER_STORAGE_KEYS).toContain(rem.GYM_JOIN_DAY_KEY);
    await rem.keepGymJoinDay('m-1', '2025-03-01');
    // Another member on this phone (left and joined again) never gets the old member's day.
    expect(await rem.keptGymJoinDay('m-2')).toBeNull();
  });
});
