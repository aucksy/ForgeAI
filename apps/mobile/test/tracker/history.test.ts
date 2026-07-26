import { beforeEach, describe, expect, it, vi } from 'vitest';

// A fixed "today": Wed 2026-07-22 (that week's Monday is 2026-07-20).
const FIXED_TODAY = '2026-07-22';

// Holder for the mocked DB read, set per test. vi.hoisted runs before the mocks.
const h = vi.hoisted(() => ({ sessions: [] as { dateISO: string }[] }));

vi.mock('@/db/repos/workoutRepo', () => ({
  // getWeekStreak asks for sessions ASC by date; return whatever the test set.
  getSessionsBetween: vi.fn(async () => h.sessions),
}));

vi.mock('@/lib/date', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/date')>();
  return { ...actual, todayISO: () => FIXED_TODAY }; // freeze only the clock
});

import { getWeekStreak } from '@/tracker/services/history';

/** Sessions must be ascending by date (the repo contract). */
function setSessions(dates: string[]): void {
  h.sessions = dates.map((dateISO) => ({ dateISO }));
}

beforeEach(() => setSessions([]));

describe('getWeekStreak', () => {
  it('is zero for no history', async () => {
    const r = await getWeekStreak();
    expect(r).toEqual({ weeks: 0, restDays: 0 });
  });

  it('does not break the streak just because the current week is still in progress', async () => {
    // Trained the two prior weeks; nothing yet this (current) week.
    setSessions(['2026-07-06', '2026-07-13']);
    const r = await getWeekStreak();
    expect(r.weeks).toBe(2);
    expect(r.restDays).toBe(9); // 2026-07-13 -> 2026-07-22
  });

  it('counts the current week once it has a session', async () => {
    setSessions(['2026-07-06', '2026-07-13', '2026-07-21']);
    const r = await getWeekStreak();
    expect(r.weeks).toBe(3);
    expect(r.restDays).toBe(1); // trained yesterday
  });

  it('breaks the streak on a missed week', async () => {
    // This week trained, but the week of 2026-07-13 was skipped.
    setSessions(['2026-07-06', '2026-07-21']);
    const r = await getWeekStreak();
    expect(r.weeks).toBe(1); // only the current week's block survives
  });

  it('counts multiple sessions in one week as a single week', async () => {
    setSessions(['2026-07-20', '2026-07-21', '2026-07-22']);
    const r = await getWeekStreak();
    expect(r.weeks).toBe(1);
    expect(r.restDays).toBe(0); // trained today
  });
});
