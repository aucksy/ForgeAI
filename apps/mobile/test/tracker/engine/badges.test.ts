/**
 * F58 Badge shelf — the one badge rule (src/tracker/engine/badges.ts).
 */
import { describe, expect, it } from 'vitest';

import { addDays } from '@/lib/date';
import { BANNED_MEMBER_WORDS } from '@/lib/words';
import {
  BADGES,
  badgeHowTo,
  badgeName,
  badgeProgressText,
  badgesEarnedIn,
  computeBadges,
  earnedNewestFirst,
  newBadgeLine,
  type BadgeId,
  type BadgeInput,
  type BadgeSet,
  type BadgeState,
  type BadgeWorkout,
} from '@/tracker/engine/badges';

let n = 0;
function w(dateISO: string, over: Partial<BadgeWorkout> = {}): BadgeWorkout {
  n += 1;
  return { id: `w${n}`, dateISO, startedAt: Date.parse(`${dateISO}T18:00:00Z`) + n, startHour: 18, kgLifted: 1000, recordLifts: 0, ...over };
}
function input(workouts: BadgeWorkout[], sets: BadgeSet[] = [], bodyweight: BadgeInput['bodyweight'] = []): BadgeInput {
  return { workouts, sets, bodyweight };
}
function get(badges: BadgeState[], id: BadgeId): BadgeState {
  return badges.find((b) => b.id === id) as BadgeState;
}

describe('the shelf', () => {
  it('holds 16 badges, ids unique', () => {
    expect(BADGES.length).toBe(16);
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(16);
  });

  it('a new member has none earned, and every badge says how to earn it', () => {
    const b = computeBadges(input([]));
    expect(b.every((x) => x.earned == null)).toBe(true);
    for (const x of b) expect(badgeHowTo(x.id).length).toBeGreaterThan(10);
  });

  it('never uses a banned member word', () => {
    const text = BADGES.flatMap((b) => [badgeName(b.id), badgeHowTo(b.id), badgeName(b.id, 'imperial'), badgeHowTo(b.id, 'imperial')]).join(' ');
    for (const banned of BANNED_MEMBER_WORDS) expect(text).not.toMatch(banned.re);
  });
});

describe('workout counts', () => {
  it('the first workout earns "First workout" on its day; the 10th earns "10 workouts"', () => {
    const ws = Array.from({ length: 12 }, (_, i) => w(addDays('2026-01-01', i * 3)));
    const b = computeBadges(input(ws));
    expect(get(b, 'workouts_1').earned).toEqual({ sessionId: ws[0].id, dateISO: ws[0].dateISO });
    expect(get(b, 'workouts_10').earned?.sessionId).toBe(ws[9].id);
    expect(get(b, 'workouts_50').earned).toBeNull();
    expect(badgeProgressText(get(b, 'workouts_50'))).toBe('12 of 50 workouts');
  });

  it('counts in the order the workouts were done, not the order given', () => {
    const ws = [w('2026-03-01'), w('2026-01-01')];
    const b = computeBadges(input(ws));
    expect(get(b, 'workouts_1').earned?.dateISO).toBe('2026-01-01');
  });
});

describe('weeks in a row', () => {
  it('4 Mondays-to-Sundays in a row earn it; a gap starts over', () => {
    // 5 Jan 2026 is a Monday. Weeks 1, 2, (gap), 4, 5, 6, 7.
    const days = ['2026-01-05', '2026-01-14', '2026-02-01', '2026-02-07', '2026-02-12', '2026-02-20'];
    const ws = days.map((d) => w(d));
    const b = computeBadges(input(ws));
    // 2026-02-01 is a Sunday (week of 26 Jan): weeks 26 Jan, 2 Feb, 9 Feb, 16 Feb = 4 in a row.
    expect(get(b, 'weeks_4').earned?.dateISO).toBe('2026-02-20');
  });

  it('a weekend off never breaks it (Monday then the next Sunday is two weeks)', () => {
    const ws = ['2026-01-05', '2026-01-18', '2026-01-19', '2026-02-01'].map((d) => w(d));
    const b = computeBadges(input(ws));
    expect(get(b, 'weeks_4').earned?.dateISO).toBe('2026-02-01');
  });

  it('keeps the longest run ever: a broken streak takes nothing away', () => {
    const ws = ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26', '2026-04-01'].map((d) => w(d));
    const b = computeBadges(input(ws));
    expect(get(b, 'weeks_4').earned).not.toBeNull();
    expect(badgeProgressText(get(b, 'weeks_12'))).toBe('Your longest run so far: 4 weeks');
  });
});

describe('records', () => {
  it('the first workout that beats a best earns "First record"; 25 lifts earn "25 records"', () => {
    const ws = [w('2026-01-01'), w('2026-01-03', { recordLifts: 2 }), w('2026-01-05', { recordLifts: 23 })];
    const b = computeBadges(input(ws));
    expect(get(b, 'record_1').earned?.sessionId).toBe(ws[1].id);
    expect(get(b, 'records_25').earned?.sessionId).toBe(ws[2].id);
  });
});

describe('lifts', () => {
  it('100 kg on a barbell for 1 rep earns the bar badge; a warm-up-free 97.5 does not', () => {
    const ws = [w('2026-01-01'), w('2026-01-08')];
    const sets: BadgeSet[] = [
      { sessionId: ws[0].id, weightKg: 97.5, reps: 5, barbell: true, bench: false },
      { sessionId: ws[1].id, weightKg: 100, reps: 1, barbell: true, bench: false },
    ];
    const b = computeBadges(input(ws, sets));
    expect(get(b, 'bar_100').earned?.sessionId).toBe(ws[1].id);
  });

  it('a non-barbell lift or a set with no reps earns nothing', () => {
    const ws = [w('2026-01-01')];
    const sets: BadgeSet[] = [
      { sessionId: ws[0].id, weightKg: 200, reps: 10, barbell: false, bench: false },
      { sessionId: ws[0].id, weightKg: 140, reps: 0, barbell: true, bench: false },
    ];
    const b = computeBadges(input(ws, sets));
    expect(get(b, 'bar_100').earned).toBeNull();
    expect(badgeProgressText(get(b, 'bar_100'))).toBeNull();
  });

  it('bench at or above body weight (on that day) earns it; with no body weight logged it cannot', () => {
    const ws = [w('2026-01-01'), w('2026-03-01')];
    const sets: BadgeSet[] = [
      { sessionId: ws[0].id, weightKg: 70, reps: 3, barbell: true, bench: true },
      { sessionId: ws[1].id, weightKg: 75, reps: 1, barbell: true, bench: true },
    ];
    const bw = [
      { dateISO: '2025-12-01', weightKg: 80 },
      { dateISO: '2026-02-01', weightKg: 74 },
    ];
    expect(get(computeBadges(input(ws, sets, bw)), 'bench_bodyweight').earned?.sessionId).toBe(ws[1].id);
    expect(get(computeBadges(input(ws, sets, [])), 'bench_bodyweight').earned).toBeNull();
  });

  it('the body-weight badge never shows a number', () => {
    const b = computeBadges(input([w('2026-01-01')]));
    expect(get(b, 'bench_bodyweight').progress).toBeNull();
    expect(badgeProgressText(get(b, 'bench_bodyweight'))).toBeNull();
    expect(badgeName('bench_bodyweight')).not.toMatch(/\d/);
    expect(badgeHowTo('bench_bodyweight')).not.toMatch(/\d/);
  });
});

describe('a big workout and early starts', () => {
  it('a member who jumps past a tier earns both on the same workout (Fitbit skipped the lower one)', () => {
    const ws = [w('2026-01-01', { kgLifted: 3200 }), w('2026-01-02', { kgLifted: 12000 })];
    const b = computeBadges(input(ws));
    expect(get(b, 'day_5000').earned?.sessionId).toBe(ws[1].id);
    expect(get(b, 'day_10000').earned?.sessionId).toBe(ws[1].id);
  });

  it('shows the best so far while locked', () => {
    const b = computeBadges(input([w('2026-01-01', { kgLifted: 3240 })]));
    expect(badgeProgressText(get(b, 'day_5000'))).toBe('Your best workout so far: 3,240 kg');
    expect(badgeProgressText(get(b, 'day_5000'), 'imperial')).toMatch(/lb$/);
  });

  it('5 workouts started from 4:00 to 6:59 earn "Early bird"; midnight (a date with no time) never counts', () => {
    const ws = [
      w('2026-01-01', { startHour: 0 }),
      w('2026-01-02', { startHour: 6 }),
      w('2026-01-03', { startHour: 5 }),
      w('2026-01-04', { startHour: 7 }),
      w('2026-01-05', { startHour: 4 }),
      w('2026-01-06', { startHour: 6 }),
    ];
    let b = computeBadges(input(ws));
    expect(get(b, 'early_5').earned).toBeNull();
    expect(badgeProgressText(get(b, 'early_5'))).toBe('4 of 5 early starts');
    const fifth = w('2026-01-07', { startHour: 5 });
    b = computeBadges(input([...ws, fifth]));
    expect(get(b, 'early_5').earned?.sessionId).toBe(fifth.id);
  });
});

describe('the finish screen line and the shelf order', () => {
  it('names only the badges this workout earned, leaving out workout counts', () => {
    const ws = [w('2026-01-01', { startHour: 18, kgLifted: 6000, recordLifts: 0 })];
    const b = computeBadges(input(ws));
    const mine = badgesEarnedIn(b, ws[0].id);
    expect(mine.map((x) => x.id).sort()).toEqual(['day_5000', 'workouts_1']);
    expect(newBadgeLine(mine)).toBe('New badge: 5,000 kg in one workout');
    expect(newBadgeLine(badgesEarnedIn(b, 'other'))).toBeNull();
    expect(newBadgeLine([get(b, 'workouts_1')])).toBeNull();
  });

  it('says "New badges" with two', () => {
    const ws = [w('2026-01-01', { kgLifted: 11000 })];
    const mine = badgesEarnedIn(computeBadges(input(ws)), ws[0].id);
    expect(newBadgeLine(mine)).toBe('New badges: 5,000 kg in one workout, 10,000 kg in one workout');
  });

  it('earned badges list newest first', () => {
    const ws = [w('2026-01-01'), ...Array.from({ length: 9 }, (_, i) => w(addDays('2026-02-01', i)))];
    const order = earnedNewestFirst(computeBadges(input(ws))).map((x) => x.id);
    expect(order[0]).toBe('workouts_10');
    expect(order[order.length - 1]).toBe('workouts_1');
  });
});
